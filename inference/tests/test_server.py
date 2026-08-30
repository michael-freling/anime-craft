"""Tests for the server entry point."""

import math
from types import SimpleNamespace
from unittest.mock import patch

from animecraft_inference import server
from animecraft_inference.config import Config
from animecraft_inference.generated import inference_pb2


def _config_passed_to_serve(argv: list[str]):
    with patch.object(server, "serve") as mock_serve:
        server.main(argv)
    assert mock_serve.call_count == 1
    return mock_serve.call_args[0][0]


def test_host_and_port_flags_override_the_environment(monkeypatch):
    monkeypatch.setenv("INFERENCE_GRPC_HOST", "localhost")
    monkeypatch.setenv("INFERENCE_GRPC_PORT", "50051")

    config = _config_passed_to_serve(["--host", "0.0.0.0", "--port", "50999"])

    assert config.listen_address == "0.0.0.0:50999"


def test_environment_is_used_when_no_flags_are_given(monkeypatch):
    monkeypatch.setenv("INFERENCE_GRPC_HOST", "127.0.0.1")
    monkeypatch.setenv("INFERENCE_GRPC_PORT", "50123")

    config = _config_passed_to_serve([])

    assert config.listen_address == "127.0.0.1:50123"


def test_the_server_places_no_limit_on_message_size():
    """gRPC's 4MB default refused a request carrying a photographic reference.
    Any fixed number in its place would only choose how large an image has to
    be before the app fails, rather than stopping there being a larger one."""
    with (
        patch.object(server.grpc, "server") as mock_grpc_server,
        patch.object(server, "LineArtExtractor"),
        patch.object(server, "FeedbackGenerator"),
        patch.object(
            server.inference_pb2_grpc, "add_InferenceServiceServicer_to_server"
        ),
        patch.object(server.signal, "signal"),
    ):
        server.serve(Config(grpc_host="127.0.0.1", grpc_port=0))

    options = dict(mock_grpc_server.call_args.kwargs["options"])
    assert options["grpc.max_receive_message_length"] == -1
    assert options["grpc.max_send_message_length"] == -1
    assert server.UNLIMITED_MESSAGE_BYTES == -1


def test_get_config_reports_the_image_size_the_models_can_use():
    """A caller that hardcoded a size would be guessing about these models, and
    would go on guessing the same number after one was reconfigured."""
    loaded = SimpleNamespace(is_loaded=True)
    servicer = server.InferenceServicer(loaded, loaded)

    response = servicer.GetConfig(inference_pb2.GetConfigRequest(), None)

    assert response.max_image_edge == server.MAX_IMAGE_EDGE
    assert response.max_image_edge > 0


def test_the_health_check_answers_only_about_health():
    """Configuration is a different question, settled at startup and read once,
    so it does not belong in something polled for liveness."""
    loaded = SimpleNamespace(is_loaded=True)
    servicer = server.InferenceServicer(loaded, loaded)

    response = servicer.HealthCheck(inference_pb2.HealthCheckRequest(), None)

    assert response.line_art_ready
    assert response.feedback_ready
    assert not hasattr(response, "max_image_edge")


def test_the_reported_size_follows_the_models():
    """Derived from what the models do rather than written out again, so
    reconfiguring or replacing one moves the reported number with it."""
    assert server.MAX_IMAGE_EDGE == max(
        server.LINEART_INPUT_SIZE, math.isqrt(server.FEEDBACK_MAX_PIXELS)
    )
    # As things stand: the line art model resizes to 512 square, and the
    # feedback processor's budget works out at 448 square.
    assert server.LINEART_INPUT_SIZE == 512
    assert math.isqrt(server.FEEDBACK_MAX_PIXELS) == 448
    assert server.MAX_IMAGE_EDGE == 512
