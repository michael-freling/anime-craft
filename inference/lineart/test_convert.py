"""Tests for the Anime2Sketch ONNX conversion pipeline."""

import os

import numpy as np
import pytest
import torch
import torch.nn as nn

from convert_to_onnx import Anime2SketchFull

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ONNX_MODEL_PATH = os.path.join(SCRIPT_DIR, "anime2sketch.onnx")


class DummyInnerModel(nn.Module):
    """A trivial model that mimics the Anime2Sketch inner model.

    Returns a fixed tensor in the [-1, 1] range that the wrapper's
    postprocessing will convert to [0, 255] uint8.
    """

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        batch = x.shape[0]
        # Return a constant grayscale output in [-1, 1] range
        return torch.zeros(batch, 1, 512, 512)


class TestAnime2SketchFull:
    """Tests for the Anime2SketchFull wrapper class."""

    def test_output_dtype_is_uint8(self):
        model = Anime2SketchFull(DummyInnerModel())
        model.eval()
        inp = torch.randint(0, 256, (1, 3, 256, 256), dtype=torch.uint8)
        with torch.no_grad():
            out = model(inp)
        assert out.dtype == torch.uint8

    def test_output_shape(self):
        model = Anime2SketchFull(DummyInnerModel())
        model.eval()
        inp = torch.randint(0, 256, (1, 3, 256, 256), dtype=torch.uint8)
        with torch.no_grad():
            out = model(inp)
        assert out.shape == (1, 1, 512, 512)

    def test_output_values_in_valid_range(self):
        model = Anime2SketchFull(DummyInnerModel())
        model.eval()
        inp = torch.randint(0, 256, (1, 3, 256, 256), dtype=torch.uint8)
        with torch.no_grad():
            out = model(inp)
        assert out.min().item() >= 0
        assert out.max().item() <= 255

    def test_different_input_sizes(self):
        """The wrapper should accept various H x W inputs and always output 512x512."""
        model = Anime2SketchFull(DummyInnerModel())
        model.eval()
        for h, w in [(128, 128), (512, 512), (768, 512), (1024, 768)]:
            inp = torch.randint(0, 256, (1, 3, h, w), dtype=torch.uint8)
            with torch.no_grad():
                out = model(inp)
            assert out.shape == (1, 1, 512, 512), (
                f"Expected (1, 1, 512, 512) for input size ({h}, {w}), got {out.shape}"
            )

    def test_known_output_for_zero_inner(self):
        """When the inner model returns all zeros, the postprocessing computes
        (0 + 1) / 2 * 255 = 127.5 which truncates to 127 via .to(torch.uint8)."""
        model = Anime2SketchFull(DummyInnerModel())
        model.eval()
        inp = torch.randint(0, 256, (1, 3, 256, 256), dtype=torch.uint8)
        with torch.no_grad():
            out = model(inp)
        # .to(torch.uint8) truncates, so 127.5 becomes 127
        expected = int((0.0 + 1.0) / 2.0 * 255.0)
        assert torch.all(out == expected), (
            f"Expected all values to be {expected}, "
            f"got min={out.min().item()} max={out.max().item()}"
        )


@pytest.mark.skipif(
    not os.path.isfile(ONNX_MODEL_PATH),
    reason=f"ONNX model not found at {ONNX_MODEL_PATH}",
)
class TestOnnxModel:
    """Tests for the exported ONNX model (skipped if the file does not exist)."""

    def test_onnx_inference(self):
        import onnxruntime as ort

        session = ort.InferenceSession(ONNX_MODEL_PATH)
        inp = np.random.randint(0, 256, (1, 3, 256, 256), dtype=np.uint8)

        input_name = session.get_inputs()[0].name
        outputs = session.run(None, {input_name: inp})

        out = outputs[0]
        assert out.shape == (1, 1, 512, 512), f"Expected shape (1, 1, 512, 512), got {out.shape}"
        assert out.dtype == np.uint8, f"Expected dtype uint8, got {out.dtype}"
        assert out.min() >= 0, f"Min value {out.min()} is below 0"
        assert out.max() <= 255, f"Max value {out.max()} is above 255"
