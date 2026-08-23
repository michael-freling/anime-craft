"""Tests for the server entry point."""

from unittest.mock import patch

from animecraft_inference import server


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
