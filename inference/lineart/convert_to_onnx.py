"""Convert Anime2Sketch PyTorch model to ONNX format.

This script:
1. Clones the Anime2Sketch repository into a temp directory
2. Downloads pretrained weights from Google Drive
3. Loads the model and wraps it with preprocessing/postprocessing
4. Exports to ONNX with opset_version=18
5. Verifies the exported ONNX model
6. Outputs anime2sketch.onnx in the same directory as this script
"""

import os
import shutil
import subprocess
import sys
import tempfile

import gdown
import onnx
import torch
import torch.nn as nn
import torch.nn.functional as F


REPO_URL = "https://github.com/Mukosame/Anime2Sketch.git"
GDRIVE_FOLDER_ID = "1Srf-WYUixK0wiUddc9y3pNKHHno5PN6R"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(SCRIPT_DIR, "anime2sketch.onnx")


class Anime2SketchFull(nn.Module):
    """Wrapper that bakes preprocessing and postprocessing into the model.

    Input:  uint8 tensor [1, 3, H, W] range [0, 255]
    Output: uint8 tensor [1, 1, 512, 512] range [0, 255]
    """

    def __init__(self, inner_model: nn.Module):
        super().__init__()
        self.inner = inner_model

    def forward(self, raw_uint8: torch.Tensor) -> torch.Tensor:
        # Preprocessing: float conversion, bicubic resize to 512x512, normalize to [-1, 1]
        x = raw_uint8.float() / 255.0
        x = F.interpolate(x, size=(512, 512), mode="bicubic", align_corners=False)
        x = (x - 0.5) / 0.5

        # Run model
        out = self.inner(x)

        # Postprocessing: denormalize to [0, 255], clamp, convert to uint8
        out = ((out + 1.0) / 2.0 * 255.0).clamp(0, 255).to(torch.uint8)
        return out


def clone_repo(tmp_dir: str) -> str:
    """Clone the Anime2Sketch repository into a temp directory."""
    repo_dir = os.path.join(tmp_dir, "Anime2Sketch")
    if os.path.isdir(repo_dir):
        print(f"Repository already exists at {repo_dir}, skipping clone.")
        return repo_dir

    print(f"Cloning {REPO_URL} into {repo_dir}...")
    subprocess.run(
        ["git", "clone", "--depth", "1", REPO_URL, repo_dir],
        check=True,
    )
    return repo_dir


def download_weights(repo_dir: str) -> None:
    """Download pretrained weights from Google Drive.

    The weights end up at ``<repo_dir>/weights/netG.pth`` which is the
    hard-coded path that ``create_model("default")`` expects when it
    calls ``torch.load('weights/netG.pth')``.

    ``gdown.download_folder`` sometimes creates a nested subfolder
    (e.g. ``weights/Anime2Sketch/netG.pth`` instead of
    ``weights/netG.pth``).  This function detects that case and moves
    the file to the correct location.
    """
    weights_dir = os.path.join(repo_dir, "weights")
    weights_path = os.path.join(weights_dir, "netG.pth")
    if os.path.isfile(weights_path):
        print(f"Weights already exist at {weights_path}, skipping download.")
        return

    os.makedirs(weights_dir, exist_ok=True)
    print(f"Downloading weights from Google Drive folder {GDRIVE_FOLDER_ID}...")
    gdown.download_folder(
        id=GDRIVE_FOLDER_ID,
        output=weights_dir,
        quiet=False,
    )

    # gdown.download_folder may create a nested subfolder (e.g.
    # weights/Anime2Sketch/netG.pth).  If the file is not where we
    # expect it, search one level of subdirectories and move it.
    if not os.path.isfile(weights_path):
        for entry in os.listdir(weights_dir):
            candidate = os.path.join(weights_dir, entry, "netG.pth")
            if os.path.isfile(candidate):
                print(
                    f"Found weights in nested folder {candidate}, "
                    f"moving to {weights_path}..."
                )
                shutil.move(candidate, weights_path)
                # Clean up the now-empty subfolder.
                nested_dir = os.path.join(weights_dir, entry)
                if not os.listdir(nested_dir):
                    os.rmdir(nested_dir)
                break

    if not os.path.isfile(weights_path):
        raise FileNotFoundError(
            f"Expected weights file not found at {weights_path} after download. "
            "Check the Google Drive folder ID."
        )


def load_model(repo_dir: str) -> nn.Module:
    """Load the Anime2Sketch model using the repository code.

    ``create_model("default")`` loads weights from the hard-coded
    relative path ``weights/netG.pth``, so we must ``os.chdir`` into
    *repo_dir* before calling it and restore the original working
    directory afterward.
    """
    # Add the repo to sys.path so we can import its modules
    if repo_dir not in sys.path:
        sys.path.insert(0, repo_dir)

    from model import create_model

    orig_dir = os.getcwd()
    try:
        os.chdir(repo_dir)
        model = create_model("default")
    finally:
        os.chdir(orig_dir)

    model.eval()
    return model


def export_onnx(wrapped_model: nn.Module) -> None:
    """Export the wrapped model to ONNX format."""
    # Use a dynamic height/width input for the raw image
    dummy_input = torch.randint(0, 256, (1, 3, 768, 512), dtype=torch.uint8)

    print(f"Exporting ONNX model to {OUTPUT_PATH}...")
    torch.onnx.export(
        wrapped_model,
        (dummy_input,),
        OUTPUT_PATH,
        opset_version=18,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={
            "input": {0: "batch", 2: "height", 3: "width"},
            "output": {0: "batch"},
        },
    )
    print("ONNX export complete.")


def verify_onnx() -> None:
    """Verify the exported ONNX model is valid."""
    print("Verifying ONNX model...")
    model = onnx.load(OUTPUT_PATH)
    onnx.checker.check_model(model)
    print("ONNX model verification passed.")


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp_dir:
        print(f"Using temp directory: {tmp_dir}")

        repo_dir = clone_repo(tmp_dir)
        download_weights(repo_dir)
        inner_model = load_model(repo_dir)

        wrapped_model = Anime2SketchFull(inner_model)
        wrapped_model.eval()

        export_onnx(wrapped_model)

    verify_onnx()
    print(f"\nDone. Output: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
