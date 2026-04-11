"""Line art extraction using the Anime2Sketch PyTorch model.

The Anime2Sketch model converts a color image into grayscale line art.
It uses a U-Net-based generator from the pix2pix framework.

Model loading follows the same approach as the ONNX conversion script at
``inference/lineart/convert_to_onnx.py``: clone the Anime2Sketch repository,
download pretrained weights from Google Drive, and use the repo's
``create_model("default")`` factory.

If a local weights path is provided via config, the download step is skipped.
"""

import io
import logging
import os
import shutil
import subprocess
import sys
import tempfile
from typing import Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image

from animecraft_inference.config import Config

logger = logging.getLogger(__name__)


class _Anime2SketchPrePostProcess(nn.Module):
    """Wraps the raw Anime2Sketch generator with pre/post-processing.

    Input:  float32 tensor [1, 3, H, W] range [0, 1]
    Output: float32 tensor [1, 1, 512, 512] range [0, 1]

    Preprocessing: bicubic resize to 512x512, normalize to [-1, 1].
    Postprocessing: denormalize from [-1, 1] to [0, 1], clamp.
    """

    def __init__(self, inner_model: nn.Module):
        super().__init__()
        self.inner = inner_model

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = F.interpolate(x, size=(512, 512), mode="bicubic", align_corners=False)
        x = (x - 0.5) / 0.5  # normalize to [-1, 1]

        out = self.inner(x)

        out = (out + 1.0) / 2.0  # denormalize to [0, 1]
        out = out.clamp(0.0, 1.0)
        return out


def _clone_repo(repo_url: str, target_dir: str) -> str:
    """Clone the Anime2Sketch repository."""
    repo_dir = os.path.join(target_dir, "Anime2Sketch")
    if os.path.isdir(repo_dir):
        logger.info("Repository already exists at %s, skipping clone.", repo_dir)
        return repo_dir

    logger.info("Cloning %s into %s...", repo_url, repo_dir)
    subprocess.run(
        ["git", "clone", "--depth", "1", repo_url, repo_dir],
        check=True,
        capture_output=True,
    )
    return repo_dir


def _download_weights(repo_dir: str, gdrive_folder_id: str) -> str:
    """Download pretrained weights from Google Drive.

    Returns the path to the weights file.
    """
    import gdown

    weights_dir = os.path.join(repo_dir, "weights")
    weights_path = os.path.join(weights_dir, "netG.pth")
    if os.path.isfile(weights_path):
        logger.info("Weights already exist at %s, skipping download.", weights_path)
        return weights_path

    os.makedirs(weights_dir, exist_ok=True)
    logger.info("Downloading weights from Google Drive folder %s...", gdrive_folder_id)
    gdown.download_folder(id=gdrive_folder_id, output=weights_dir, quiet=False)

    # gdown may create a nested subfolder
    if not os.path.isfile(weights_path):
        for entry in os.listdir(weights_dir):
            candidate = os.path.join(weights_dir, entry, "netG.pth")
            if os.path.isfile(candidate):
                logger.info("Moving weights from nested folder %s", candidate)
                shutil.move(candidate, weights_path)
                nested_dir = os.path.join(weights_dir, entry)
                if not os.listdir(nested_dir):
                    os.rmdir(nested_dir)
                break

    if not os.path.isfile(weights_path):
        raise FileNotFoundError(
            f"Expected weights file not found at {weights_path} after download."
        )
    return weights_path


def _load_inner_model(repo_dir: str) -> nn.Module:
    """Load the raw Anime2Sketch model using the repository's create_model()."""
    if repo_dir not in sys.path:
        sys.path.insert(0, repo_dir)

    from model import create_model  # type: ignore[import-not-found]

    orig_dir = os.getcwd()
    try:
        os.chdir(repo_dir)
        model = create_model("default")
    finally:
        os.chdir(orig_dir)

    model.eval()
    return model


class LineArtExtractor:
    """Extracts line art from images using the Anime2Sketch model.

    Usage::

        extractor = LineArtExtractor(config)
        extractor.load()
        png_bytes = extractor.extract(jpeg_bytes)
    """

    def __init__(self, config: Config):
        self._config = config
        self._model: Optional[_Anime2SketchPrePostProcess] = None
        self._device: Optional[torch.device] = None
        self._tmp_dir: Optional[str] = None

    @property
    def is_loaded(self) -> bool:
        """Whether the model has been loaded successfully."""
        return self._model is not None

    def load(self) -> None:
        """Load the Anime2Sketch model.

        If ``config.lineart_weights_path`` points to a directory containing
        the Anime2Sketch repo (with ``model.py`` and ``weights/netG.pth``),
        the model is loaded directly from there.  Otherwise the repo is cloned
        and weights are downloaded to a temporary directory.
        """
        self._device = torch.device(self._config.resolved_device)
        logger.info("Loading line art model on device: %s", self._device)

        weights_path = self._config.lineart_weights_path

        if weights_path and os.path.isfile(weights_path):
            # weights_path points directly to a netG.pth file.
            # We still need the repo code to construct the model architecture.
            self._tmp_dir = tempfile.mkdtemp(prefix="anime2sketch_")
            repo_dir = _clone_repo(self._config.lineart_model_repo, self._tmp_dir)
            # Symlink / copy the weights into the expected location
            expected = os.path.join(repo_dir, "weights", "netG.pth")
            os.makedirs(os.path.dirname(expected), exist_ok=True)
            if not os.path.isfile(expected):
                shutil.copy2(weights_path, expected)
            inner = _load_inner_model(repo_dir)
        elif weights_path and os.path.isdir(weights_path):
            # Assume the directory is the Anime2Sketch repo itself
            inner = _load_inner_model(weights_path)
        else:
            # Clone and download from scratch
            self._tmp_dir = tempfile.mkdtemp(prefix="anime2sketch_")
            repo_dir = _clone_repo(self._config.lineart_model_repo, self._tmp_dir)
            _download_weights(repo_dir, self._config.lineart_weights_gdrive_folder)
            inner = _load_inner_model(repo_dir)

        self._model = _Anime2SketchPrePostProcess(inner)
        self._model.eval()
        self._model.to(self._device)
        logger.info("Line art model loaded successfully.")

    def extract(self, image_bytes: bytes) -> bytes:
        """Convert an image to grayscale line art.

        Args:
            image_bytes: Raw image bytes (JPEG or PNG).

        Returns:
            PNG-encoded grayscale line art image bytes.

        Raises:
            RuntimeError: If the model has not been loaded.
            ValueError: If the input bytes cannot be decoded as an image.
        """
        if self._model is None or self._device is None:
            raise RuntimeError(
                "Model not loaded. Call load() before extract()."
            )

        # Decode image
        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        except Exception as exc:
            raise ValueError(f"Failed to decode input image: {exc}") from exc

        # Convert to tensor: [1, 3, H, W] float32 in [0, 1]
        img_array = np.array(image, dtype=np.float32) / 255.0
        tensor = torch.from_numpy(img_array).permute(2, 0, 1).unsqueeze(0)
        tensor = tensor.to(self._device)

        # Run inference
        with torch.no_grad():
            output = self._model(tensor)

        # Convert output to PIL Image: [1, 1, 512, 512] -> grayscale
        out_array = output.squeeze().cpu().numpy()
        out_array = (out_array * 255.0).clip(0, 255).astype(np.uint8)
        out_image = Image.fromarray(out_array, mode="L")

        # Encode as PNG
        buf = io.BytesIO()
        out_image.save(buf, format="PNG")
        return buf.getvalue()

    def cleanup(self) -> None:
        """Remove temporary files created during model loading."""
        if self._tmp_dir and os.path.isdir(self._tmp_dir):
            shutil.rmtree(self._tmp_dir, ignore_errors=True)
            self._tmp_dir = None
