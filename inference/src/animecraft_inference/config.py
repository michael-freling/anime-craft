"""Configuration for the inference service.

All settings can be overridden via environment variables.
"""

import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Config:
    """Inference service configuration loaded from environment variables."""

    # gRPC server
    grpc_host: str = field(
        default_factory=lambda: os.environ.get("INFERENCE_GRPC_HOST", "localhost")
    )
    grpc_port: int = field(
        default_factory=lambda: int(os.environ.get("INFERENCE_GRPC_PORT", "50051"))
    )

    # PyTorch device: "cuda", "cpu", or "auto" (auto picks cuda if available)
    device: str = field(
        default_factory=lambda: os.environ.get("INFERENCE_DEVICE", "auto")
    )

    # Line art model
    lineart_model_repo: str = field(
        default_factory=lambda: os.environ.get(
            "INFERENCE_LINEART_REPO", "https://github.com/Mukosame/Anime2Sketch.git"
        )
    )
    lineart_weights_gdrive_folder: str = field(
        default_factory=lambda: os.environ.get(
            "INFERENCE_LINEART_GDRIVE_FOLDER", "1Srf-WYUixK0wiUddc9y3pNKHHno5PN6R"
        )
    )
    lineart_weights_path: str = field(
        default_factory=lambda: os.environ.get(
            "INFERENCE_LINEART_WEIGHTS", ""
        )
    )

    # Feedback VLM model
    feedback_model_id: str = field(
        default_factory=lambda: os.environ.get(
            "INFERENCE_FEEDBACK_MODEL", "Qwen/Qwen2.5-VL-3B-Instruct"
        )
    )
    feedback_model_cache_dir: str = field(
        default_factory=lambda: os.environ.get("INFERENCE_MODEL_CACHE_DIR", "")
    )

    # Generation parameters
    feedback_max_new_tokens: int = field(
        default_factory=lambda: int(
            os.environ.get("INFERENCE_FEEDBACK_MAX_TOKENS", "2048")
        )
    )
    feedback_temperature: float = field(
        default_factory=lambda: float(
            os.environ.get("INFERENCE_FEEDBACK_TEMPERATURE", "0.7")
        )
    )

    @property
    def resolved_device(self) -> str:
        """Return the actual torch device string."""
        if self.device != "auto":
            return self.device
        try:
            import torch

            return "cuda" if torch.cuda.is_available() else "cpu"
        except ImportError:
            return "cpu"

    @property
    def listen_address(self) -> str:
        """Return the gRPC listen address in host:port format."""
        return f"{self.grpc_host}:{self.grpc_port}"


def load_config() -> Config:
    """Create a Config instance from the current environment."""
    return Config()
