"""Tests for the line art extraction module."""

import io
import os

import numpy as np
import pytest
import torch
import torch.nn as nn
from PIL import Image

from animecraft_inference.config import Config
from animecraft_inference.lineart.extractor import (
    LineArtExtractor,
    _Anime2SketchPrePostProcess,
)


class DummyInnerModel(nn.Module):
    """A trivial model that returns a constant grayscale output in [-1, 1]."""

    def __init__(self, value: float = 0.0):
        super().__init__()
        self._value = value

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        batch = x.shape[0]
        return torch.full((batch, 1, 512, 512), self._value)


class TestAnime2SketchPrePostProcess:
    """Tests for the pre/post-processing wrapper."""

    def test_output_shape(self):
        model = _Anime2SketchPrePostProcess(DummyInnerModel())
        model.eval()
        inp = torch.rand(1, 3, 256, 256)
        with torch.no_grad():
            out = model(inp)
        assert out.shape == (1, 1, 512, 512)

    def test_output_range_zero_inner(self):
        """When inner returns 0.0, post-processing gives (0+1)/2 = 0.5."""
        model = _Anime2SketchPrePostProcess(DummyInnerModel(0.0))
        model.eval()
        inp = torch.rand(1, 3, 128, 128)
        with torch.no_grad():
            out = model(inp)
        assert out.min().item() >= 0.0
        assert out.max().item() <= 1.0
        assert abs(out.mean().item() - 0.5) < 1e-5

    def test_output_range_negative_one(self):
        """When inner returns -1.0, post-processing gives (-1+1)/2 = 0.0."""
        model = _Anime2SketchPrePostProcess(DummyInnerModel(-1.0))
        model.eval()
        inp = torch.rand(1, 3, 128, 128)
        with torch.no_grad():
            out = model(inp)
        assert abs(out.mean().item() - 0.0) < 1e-5

    def test_output_range_positive_one(self):
        """When inner returns 1.0, post-processing gives (1+1)/2 = 1.0."""
        model = _Anime2SketchPrePostProcess(DummyInnerModel(1.0))
        model.eval()
        inp = torch.rand(1, 3, 128, 128)
        with torch.no_grad():
            out = model(inp)
        assert abs(out.mean().item() - 1.0) < 1e-5

    def test_different_input_sizes(self):
        """Output is always 512x512 regardless of input size."""
        model = _Anime2SketchPrePostProcess(DummyInnerModel())
        model.eval()
        for h, w in [(64, 64), (256, 256), (512, 512), (768, 1024)]:
            inp = torch.rand(1, 3, h, w)
            with torch.no_grad():
                out = model(inp)
            assert out.shape == (1, 1, 512, 512), (
                f"Expected (1, 1, 512, 512) for input ({h}, {w}), got {out.shape}"
            )

    def test_clamping(self):
        """Values outside [0, 1] after post-processing are clamped."""
        # Inner returning 2.0 -> (2+1)/2 = 1.5, clamped to 1.0
        model = _Anime2SketchPrePostProcess(DummyInnerModel(2.0))
        model.eval()
        inp = torch.rand(1, 3, 128, 128)
        with torch.no_grad():
            out = model(inp)
        assert out.max().item() <= 1.0


class TestLineArtExtractorNotLoaded:
    """Tests for the extractor before the model is loaded."""

    def test_is_loaded_false_initially(self):
        config = Config()
        extractor = LineArtExtractor(config)
        assert not extractor.is_loaded

    def test_extract_raises_without_load(self):
        config = Config()
        extractor = LineArtExtractor(config)
        with pytest.raises(RuntimeError, match="Model not loaded"):
            extractor.extract(b"fake image data")


def _make_test_png(width: int = 64, height: int = 64) -> bytes:
    """Create a minimal PNG image for testing."""
    arr = np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
    img = Image.fromarray(arr, "RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.skipif(
    os.environ.get("INFERENCE_LINEART_WEIGHTS", "") == ""
    and not os.environ.get("INFERENCE_RUN_MODEL_TESTS"),
    reason=(
        "Line art model weights not available. "
        "Set INFERENCE_LINEART_WEIGHTS or INFERENCE_RUN_MODEL_TESTS=1 to run."
    ),
)
class TestLineArtExtractorWithModel:
    """Integration tests that require the actual model to be available."""

    @pytest.fixture(autouse=True)
    def setup(self):
        config = Config()
        self.extractor = LineArtExtractor(config)
        self.extractor.load()
        yield
        self.extractor.cleanup()

    def test_extract_returns_png(self):
        png_input = _make_test_png(256, 256)
        result = self.extractor.extract(png_input)
        # Verify result is valid PNG
        img = Image.open(io.BytesIO(result))
        assert img.format == "PNG"
        assert img.mode == "L"  # grayscale
        assert img.size == (512, 512)

    def test_extract_jpeg_input(self):
        """The extractor should also accept JPEG input."""
        arr = np.random.randint(0, 256, (128, 128, 3), dtype=np.uint8)
        img = Image.fromarray(arr, "RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        jpeg_bytes = buf.getvalue()

        result = self.extractor.extract(jpeg_bytes)
        img = Image.open(io.BytesIO(result))
        assert img.format == "PNG"
        assert img.mode == "L"
