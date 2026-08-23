"""Image comparison using SSIM (Structural Similarity Index)."""

import io
import logging

import numpy as np
from PIL import Image
from skimage.metrics import structural_similarity as ssim

logger = logging.getLogger(__name__)


def compute_ssim_heatmap(reference_png: bytes, drawing_png: bytes) -> bytes:
    """Compare reference line art and drawing using SSIM.

    Returns a PNG heatmap where:
    - Green = high structural similarity (good match)
    - Red = low structural similarity (needs work)
    - Yellow = moderate similarity

    Both images are converted to grayscale and resized to match.
    """
    ref_img = Image.open(io.BytesIO(reference_png)).convert("L")
    draw_img = Image.open(io.BytesIO(drawing_png)).convert("L")

    # Resize drawing to match reference dimensions
    if ref_img.size != draw_img.size:
        draw_img = draw_img.resize(ref_img.size, Image.LANCZOS)

    ref_arr = np.array(ref_img, dtype=np.float64)
    draw_arr = np.array(draw_img, dtype=np.float64)

    # Compute SSIM with full similarity map
    _, ssim_map = ssim(ref_arr, draw_arr, full=True, data_range=255)

    # Convert similarity map (0-1) to RGB heatmap
    # 1.0 = perfect match (green), 0.0 = no match (red)
    ssim_map = np.clip(ssim_map, 0, 1)

    h, w = ssim_map.shape
    heatmap = np.zeros((h, w, 3), dtype=np.uint8)

    # Red channel: high where similarity is LOW
    heatmap[:, :, 0] = ((1 - ssim_map) * 220).astype(np.uint8)
    # Green channel: high where similarity is HIGH
    heatmap[:, :, 1] = (ssim_map * 200).astype(np.uint8)
    # Blue channel: minimal
    heatmap[:, :, 2] = 30

    # Make background (areas where both images are white/empty) light gray
    # instead of colored, so the heatmap focuses on actual line areas
    ref_has_content = ref_arr < 220
    draw_has_content = draw_arr < 220
    has_content = ref_has_content | draw_has_content
    heatmap[~has_content] = [240, 240, 240]

    result = Image.fromarray(heatmap)
    buf = io.BytesIO()
    result.save(buf, format="PNG")
    return buf.getvalue()
