"""Dump the AT-SPI tree for debugging. Runs first (alphabetical order)."""

import sys


def _dump(node, indent=0, max_depth=10):
    if indent > max_depth:
        return
    try:
        role = node.get_role_name()
        name = node.get_name()
        action = node.get_action_iface()
        n_actions = action.get_n_actions() if action else 0
        print(f"{'  ' * indent}{role}: '{name}' (actions={n_actions})")
    except Exception as e:
        print(f"{'  ' * indent}[error: {e}]")
        return
    for i in range(node.get_child_count()):
        child = node.get_child_at_index(i)
        if child:
            _dump(child, indent + 1, max_depth)


def test_dump_atspi_tree(app):
    """Print the full AT-SPI tree for debugging purposes."""
    print("\n=== AT-SPI TREE DUMP ===", file=sys.stderr)
    _dump_to_stderr(app)
    print("=== END AT-SPI TREE DUMP ===", file=sys.stderr)


def _dump_to_stderr(node, indent=0, max_depth=10):
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
