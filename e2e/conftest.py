import os
import signal
import subprocess
import tempfile
import time

import pytest

import gi
gi.require_version("Atspi", "2.0")
from gi.repository import Atspi


def _find_app_in_atspi(name, timeout=30):
    """Poll the AT-SPI desktop until an application with the given name appears."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        desktop = Atspi.get_desktop(0)
        for i in range(desktop.get_child_count()):
            child = desktop.get_child_at_index(i)
            if child and child.get_name() == name:
                return child
        time.sleep(0.5)
    raise TimeoutError(f"Application '{name}' did not appear in AT-SPI tree within {timeout}s")


@pytest.fixture(scope="session")
def app():
    """Launch the anime-craft app inside Xvfb + dbus and yield its AT-SPI node."""

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    binary = os.path.join(project_root, "anime-craft")

    # If the binary has not been pre-built, build it now.
    if not os.path.isfile(binary):
        subprocess.check_call(
            ["go", "build", "-cover", "-o", binary, "."],
            cwd=project_root,
        )

    # Coverage directory
    gocoverdir = os.environ.get("GOCOVERDIR") or tempfile.mkdtemp(prefix="gocoverdir_")
    os.makedirs(gocoverdir, exist_ok=True)

    env = os.environ.copy()
    env["GOCOVERDIR"] = gocoverdir
    env.setdefault("GTK_MODULES", "gail:atk-bridge")
    # DISPLAY should already be set by xvfb-run or the caller

    proc = subprocess.Popen(
        [binary],
        cwd=project_root,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        app_node = _find_app_in_atspi("anime-craft", timeout=30)
        yield app_node
    finally:
        # Graceful shutdown
        proc.send_signal(signal.SIGTERM)
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
