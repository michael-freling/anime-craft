"""Tests for the server entry point."""

from unittest.mock import patch

from animecraft_inference import server
from animecraft_inference.config import Config


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
