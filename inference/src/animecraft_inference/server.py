"""gRPC server for the Anime Craft inference service.

Implements InferenceService with three RPCs:
  - ExtractLineArt: unary, converts an image to grayscale line art
  - GenerateFeedback: server-streaming, compares reference with drawing
  - HealthCheck: unary, reports model readiness

Run with: python -m animecraft_inference.server
"""

import argparse
import logging
import signal
import sys
import threading
from collections.abc import Iterator
from concurrent import futures
from dataclasses import replace

import grpc

from animecraft_inference.config import Config, load_config
from animecraft_inference.feedback.generator import (
    FeedbackGenerator,
    parse_feedback_json,
)
from animecraft_inference.lineart.extractor import LineArtExtractor

# Import generated protobuf stubs.
# These are created by running `pdm run protoc` from the inference/ directory.
try:
    from animecraft_inference.generated import inference_pb2, inference_pb2_grpc
except ImportError:
    # Provide a helpful error when stubs are missing.
    print(
        "ERROR: Generated protobuf stubs not found.\n"
        "Run `pdm run protoc` from the inference/ directory to generate them.",
        file=sys.stderr,
    )
    raise


# gRPC's own value for "no limit". Its 4MB default refused a request carrying a
# photographic reference outright, and any fixed number in its place would only
# choose how large an image has to be before the app fails rather than stopping
# there being a larger one.
#
# The gateway shrinks images to what the models can actually look at before
# sending them, so requests are small whatever was uploaded; this is here so
# that the cases it cannot help with — a format it does not decode, and so
# passes through whole — arrive rather than being rejected.
UNLIMITED_MESSAGE_BYTES = -1

logger = logging.getLogger(__name__)


class InferenceServicer(inference_pb2_grpc.InferenceServiceServicer):
    """gRPC servicer implementing the InferenceService RPCs."""

    def __init__(
        self,
        lineart_extractor: LineArtExtractor,
        feedback_generator: FeedbackGenerator,
    ):
        self._lineart = lineart_extractor
        self._feedback = feedback_generator
        self._feedback_sem = threading.Semaphore(1)

    def ExtractLineArt(
        self,
        request: inference_pb2.ExtractLineArtRequest,
        context: grpc.ServicerContext,
    ) -> inference_pb2.ExtractLineArtResponse:
        """Convert a reference image to grayscale line art."""
        if not self._lineart.is_loaded:
            context.abort(
                grpc.StatusCode.UNAVAILABLE,
                "Line art model is not loaded yet.",
            )

        if not request.image_data:
            context.abort(
                grpc.StatusCode.INVALID_ARGUMENT,
                "image_data must not be empty.",
            )

        try:
            line_art_png = self._lineart.extract(request.image_data)
        except ValueError as exc:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
        except Exception as exc:
            logger.exception("Line art extraction failed")
            context.abort(
                grpc.StatusCode.INTERNAL,
                f"Line art extraction failed: {exc}",
            )

        return inference_pb2.ExtractLineArtResponse(line_art_png=line_art_png)

    def GenerateFeedback(
        self,
        request: inference_pb2.GenerateFeedbackRequest,
        context: grpc.ServicerContext,
    ) -> Iterator[inference_pb2.GenerateFeedbackResponse]:
        """Stream feedback comparing reference line art with a drawing."""
        if not self._feedback.is_loaded:
            context.abort(
                grpc.StatusCode.UNAVAILABLE,
                "Feedback model is not loaded yet.",
            )

        if not request.reference_line_art_png:
            context.abort(
                grpc.StatusCode.INVALID_ARGUMENT,
                "reference_line_art_png must not be empty.",
            )

        if not request.drawing_png:
            context.abort(
                grpc.StatusCode.INVALID_ARGUMENT,
                "drawing_png must not be empty.",
            )

        acquired = self._feedback_sem.acquire(timeout=0.1)
        if not acquired:
            context.abort(
                grpc.StatusCode.RESOURCE_EXHAUSTED,
                "Another feedback request is already in progress. Please wait.",
            )

        try:
            accumulated_text = ""
            for chunk in self._feedback.generate(
                reference_line_art_png=request.reference_line_art_png,
                drawing_png=request.drawing_png,
                exercise_mode=request.exercise_mode,
            ):
                # Check if the client has disconnected (e.g. deadline exceeded)
                # so we can stop generation early instead of wasting GPU cycles.
                if not context.is_active():
                    logger.info("Client disconnected, aborting feedback generation")
                    break
                accumulated_text += chunk
                yield inference_pb2.GenerateFeedbackResponse(text_chunk=chunk)

            # Only send the parsed result if the client is still connected.
            if context.is_active():
                parsed = parse_feedback_json(accumulated_text)
                result_msg = inference_pb2.FeedbackResult(
                    overall_score=parsed.overall_score,
                    proportions_score=parsed.proportions_score,
                    line_quality_score=parsed.line_quality_score,
                    accuracy_score=parsed.accuracy_score,
                    summary=parsed.summary,
                    details=parsed.details,
                    strengths=parsed.strengths,
                    improvements=parsed.improvements,
                )
                yield inference_pb2.GenerateFeedbackResponse(result=result_msg)

        except Exception as exc:
            logger.exception("Feedback generation failed")
            # Only abort if the client is still listening; otherwise the
            # context is already cancelled and abort would be a no-op or
            # raise its own error.
            if context.is_active():
                context.abort(
                    grpc.StatusCode.INTERNAL,
                    f"Feedback generation failed: {exc}",
                )
        finally:
            self._feedback_sem.release()

    def CompareImages(
        self,
        request: inference_pb2.CompareImagesRequest,
        context: grpc.ServicerContext,
    ) -> inference_pb2.CompareImagesResponse:
        """Generate an SSIM heatmap comparing reference line art with a drawing."""
        if not request.reference_line_art_png or not request.drawing_png:
            context.abort(
                grpc.StatusCode.INVALID_ARGUMENT,
                "Both images required.",
            )

        try:
            from animecraft_inference.comparison import compute_ssim_heatmap

            heatmap = compute_ssim_heatmap(
                request.reference_line_art_png, request.drawing_png
            )
            return inference_pb2.CompareImagesResponse(heatmap_png=heatmap)
        except Exception as exc:
            logger.exception("Image comparison failed")
            context.abort(
                grpc.StatusCode.INTERNAL,
                f"Image comparison failed: {exc}",
            )

    def HealthCheck(
        self,
        request: inference_pb2.HealthCheckRequest,
        context: grpc.ServicerContext,
    ) -> inference_pb2.HealthCheckResponse:
        """Report whether models are loaded and ready."""
        lineart_ready = self._lineart.is_loaded
        feedback_ready = self._feedback.is_loaded

        if lineart_ready and feedback_ready:
            status = "All models loaded and ready."
        else:
            parts = []
            if not lineart_ready:
                parts.append("line art model not loaded")
            if not feedback_ready:
                parts.append("feedback model not loaded")
            status = "Not ready: " + ", ".join(parts) + "."

        return inference_pb2.HealthCheckResponse(
            line_art_ready=lineart_ready,
            feedback_ready=feedback_ready,
            status_message=status,
        )


def serve(config: Config) -> None:
    """Start the gRPC server and block until shutdown."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    # Initialize components
    lineart_extractor = LineArtExtractor(config)
    feedback_generator = FeedbackGenerator(config)

    # Load models
    logger.info("Loading models...")
    try:
        lineart_extractor.load()
    except Exception:
        logger.exception("Failed to load line art model — continuing without it")

    try:
        feedback_generator.load()
    except Exception:
        logger.exception("Failed to load feedback model — continuing without it")

    # Create gRPC server
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=10),
        options=[
            ("grpc.max_receive_message_length", UNLIMITED_MESSAGE_BYTES),
            ("grpc.max_send_message_length", UNLIMITED_MESSAGE_BYTES),
        ],
    )
    servicer = InferenceServicer(lineart_extractor, feedback_generator)
    inference_pb2_grpc.add_InferenceServiceServicer_to_server(servicer, server)

    listen_addr = config.listen_address
    server.add_insecure_port(listen_addr)

    # Graceful shutdown on SIGTERM and SIGINT
    def _handle_signal(signum: int, _frame: object) -> None:
        sig_name = signal.Signals(signum).name
        logger.info("Received %s, initiating graceful shutdown...", sig_name)
        server.stop(grace=5)
        lineart_extractor.cleanup()

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    server.start()
    logger.info("Inference server listening on %s", listen_addr)
    server.wait_for_termination()
    logger.info("Server shut down.")


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="animecraft-inference",
        description="Anime Craft inference service.",
    )
    parser.add_argument(
        "--host",
        default=None,
        help=(
            "Address to bind (default: INFERENCE_GRPC_HOST, or localhost). "
            "Use 0.0.0.0 to accept connections from Windows when the service "
            "runs under WSL."
        ),
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Port to listen on (default: INFERENCE_GRPC_PORT, or 50051).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    """Entry point for ``python -m animecraft_inference.server``."""
    args = _parse_args(argv)
    config = load_config()

    overrides = {}
    if args.host is not None:
        overrides["grpc_host"] = args.host
    if args.port is not None:
        overrides["grpc_port"] = args.port
    if overrides:
        config = replace(config, **overrides)

    serve(config)


if __name__ == "__main__":
    main()
