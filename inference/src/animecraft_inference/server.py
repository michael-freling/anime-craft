"""gRPC server for the Anime Craft inference service.

Implements InferenceService with three RPCs:
  - ExtractLineArt: unary, converts an image to grayscale line art
  - GenerateFeedback: server-streaming, compares reference with drawing
  - HealthCheck: unary, reports model readiness

Run with: python -m animecraft_inference.server
"""

import logging
import signal
import sys
from concurrent import futures
from typing import Iterator

import grpc

from animecraft_inference.config import Config, load_config
from animecraft_inference.feedback.generator import (
    FeedbackGenerator,
    FeedbackResult,
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

        try:
            accumulated_text = ""
            for chunk in self._feedback.generate(
                reference_line_art_png=request.reference_line_art_png,
                drawing_png=request.drawing_png,
                exercise_mode=request.exercise_mode,
            ):
                accumulated_text += chunk
                yield inference_pb2.GenerateFeedbackResponse(text_chunk=chunk)

            # Parse the accumulated text into a structured result
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
            context.abort(
                grpc.StatusCode.INTERNAL,
                f"Feedback generation failed: {exc}",
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
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    servicer = InferenceServicer(lineart_extractor, feedback_generator)
    inference_pb2_grpc.add_InferenceServiceServicer_to_server(servicer, server)

    listen_addr = config.listen_address
    server.add_insecure_port(listen_addr)

    # Graceful shutdown on SIGTERM and SIGINT
    shutdown_event = None

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


def main() -> None:
    """Entry point for ``python -m animecraft_inference.server``."""
    config = load_config()
    serve(config)


if __name__ == "__main__":
    main()
