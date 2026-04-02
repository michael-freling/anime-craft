"""Dump the AT-SPI tree for debugging. Runs first (alphabetical order)."""

import sys
import time

from helpers import find_by_role_and_name


def _dump_to_stderr(node, indent=0, max_depth=12):
    if indent > max_depth:
        return
    try:
        role = node.get_role_name()
        name = node.get_name()
        action = node.get_action_iface()
        n_actions = action.get_n_actions() if action else 0
        print(f"{'  ' * indent}{role}: '{name}' (actions={n_actions})", file=sys.stderr)
    except Exception as e:
        print(f"{'  ' * indent}[error: {e}]", file=sys.stderr)
        return
    for i in range(node.get_child_count()):
        child = node.get_child_at_index(i)
        if child:
            _dump_to_stderr(child, indent + 1, max_depth)


def test_dump_atspi_tree(app):
    """Print the full AT-SPI tree for debugging purposes.

    Waits for web content to load before dumping (same as other tests).
    """
    # Wait for a known element to appear — this ensures the webview content is loaded
    try:
        find_by_role_and_name(app, "push button", "Start Session", timeout=15)
    except Exception:
        pass  # Dump whatever we have even if the element isn't found

    print("\n=== AT-SPI TREE DUMP ===", file=sys.stderr)
    _dump_to_stderr(app)
    print("=== END AT-SPI TREE DUMP ===", file=sys.stderr)
