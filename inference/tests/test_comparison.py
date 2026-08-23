"""Tests for the SSIM comparison module."""

import io

import numpy as np
from animecraft_inference.comparison import compute_ssim_heatmap
from PIL import Image


def _make_png(width: int, height: int, color: int = 128) -> bytes:
    """Create a solid grayscale PNG image."""
    arr = np.full((height, width), color, dtype=np.uint8)
    img = Image.fromarray(arr, "L")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_rgb_png(width: int, height: int) -> bytes:
    """Create a random RGB PNG image with some dark lines."""
    arr = np.full((height, width, 3), 255, dtype=np.uint8)
    # Draw a horizontal dark line
    arr[height // 2 - 2 : height // 2 + 2, :] = 0
    img = Image.fromarray(arr, "RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class TestComputeSsimHeatmap:
    """Tests for compute_ssim_heatmap."""

    def test_identical_images_mostly_gray(self):
        """When both images are identical white, the heatmap should be mostly light gray."""
        white_png = _make_png(64, 64, color=255)
        result = compute_ssim_heatmap(white_png, white_png)

        img = Image.open(io.BytesIO(result))
        assert img.format == "PNG"
        assert img.mode == "RGB"
        assert img.size == (64, 64)

        # Both images are white (>= 220), so all pixels should be background
        arr = np.array(img)
        assert np.all(arr[:, :, 0] == 240), "Background R should be 240"
        assert np.all(arr[:, :, 1] == 240), "Background G should be 240"
        assert np.all(arr[:, :, 2] == 240), "Background B should be 240"

    def test_different_sizes_resized(self):
        """Drawing is resized to match reference dimensions."""
        ref = _make_png(100, 80, color=128)
        draw = _make_png(50, 40, color=128)

        result = compute_ssim_heatmap(ref, draw)

        img = Image.open(io.BytesIO(result))
        assert img.size == (100, 80)

    def test_returns_valid_png(self):
        """Result is always a valid PNG image."""
        ref = _make_png(64, 64, color=100)
        draw = _make_png(64, 64, color=200)

        result = compute_ssim_heatmap(ref, draw)

        img = Image.open(io.BytesIO(result))
        assert img.format == "PNG"
        assert img.mode == "RGB"

    def test_content_areas_are_colored(self):
        """Pixels with content (dark areas) should get heatmap coloring."""
        # Reference has dark content, drawing is all white
        ref_arr = np.full((64, 64), 255, dtype=np.uint8)
        ref_arr[20:40, 20:40] = 0  # dark square in reference
        ref_img = Image.fromarray(ref_arr, "L")
        ref_buf = io.BytesIO()
        ref_img.save(ref_buf, format="PNG")
        ref_png = ref_buf.getvalue()

        draw_png = _make_png(64, 64, color=255)  # all white

        result = compute_ssim_heatmap(ref_png, draw_png)
        img = Image.open(io.BytesIO(result))
        arr = np.array(img)

        # Content area (where ref has dark lines) should have red tint
        content_r = arr[25, 25, 0]
        content_g = arr[25, 25, 1]
        assert content_r > content_g, (
            f"Content area should have more red than green (R={content_r}, G={content_g})"
        )

        # Background area should be light gray
        bg_r = arr[5, 5, 0]
        bg_g = arr[5, 5, 1]
        bg_b = arr[5, 5, 2]
        assert bg_r == 240 and bg_g == 240 and bg_b == 240

    def test_rgb_input_converted_to_grayscale(self):
        """RGB input images are converted to grayscale without error."""
        ref = _make_rgb_png(64, 64)
        draw = _make_rgb_png(64, 64)

        result = compute_ssim_heatmap(ref, draw)
        img = Image.open(io.BytesIO(result))
        assert img.format == "PNG"
        assert img.mode == "RGB"
        assert img.size == (64, 64)

    def test_matching_dark_content_is_green(self):
        """When both images have the same dark content, the heatmap should be green there."""
        arr = np.full((64, 64), 255, dtype=np.uint8)
        arr[20:40, 20:40] = 50  # matching dark square in both

        img = Image.fromarray(arr, "L")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        png_data = buf.getvalue()

        result = compute_ssim_heatmap(png_data, png_data)
        heatmap = np.array(Image.open(io.BytesIO(result)))

        # Content area with perfect match should have high green, low red
        content_g = heatmap[30, 30, 1]
        content_r = heatmap[30, 30, 0]
        assert content_g > content_r, (
            f"Matching content should be green-dominant (R={content_r}, G={content_g})"
        )
