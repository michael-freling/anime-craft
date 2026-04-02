"""Shared AT-SPI helper functions for e2e tests."""

import time

import gi
gi.require_version("Atspi", "2.0")
from gi.repository import Atspi


def find_all_by_role_and_name(node, role_name, name=None, results=None):
    """Recursively find all accessible elements matching a role and optional name."""
    if results is None:
        results = []
    try:
        node_role = node.get_role_name()
        node_name = node.get_name()
    except Exception:
        return results

    if node_role == role_name:
        if name is None or node_name == name:
            results.append(node)

    for i in range(node.get_child_count()):
        child = node.get_child_at_index(i)
        if child:
            find_all_by_role_and_name(child, role_name, name, results)

    return results


def find_by_role_and_name(node, role_name, name=None, timeout=10):
    """Find a single element by role and name, retrying until timeout."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        results = find_all_by_role_and_name(node, role_name, name)
        if results:
            return results[0]
        time.sleep(0.5)
    role_desc = f"role='{role_name}'"
    if name is not None:
        role_desc += f", name='{name}'"
    raise AssertionError(f"Element not found: {role_desc}")


def click_element(element):
    """Click an AT-SPI element using its action interface or mouse event fallback."""
    action = element.get_action_iface()
    if action and action.get_n_actions() > 0:
        action.do_action(0)
        return
    # Fallback: generate a mouse click at the element's screen position.
    component = element.get_component_iface()
    if component:
        rect = component.get_extents(Atspi.CoordType.SCREEN)
        x = rect.x + rect.width // 2
        y = rect.y + rect.height // 2
        Atspi.generate_mouse_event(x, y, "b1c")
        return
    raise RuntimeError("Element has no action or component interface for clicking")
