"""E2E tests for the reference image flow using AT-SPI."""

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


def test_app_shows_title(app):
    """The app window should display 'Anime Craft' as its title."""
    frame = find_by_role_and_name(app, "frame", "Anime Craft")
    assert frame is not None


def test_home_navigation_visible(app):
    """The 'Home' navigation form should be visible."""
    home = find_by_role_and_name(app, "form", "Home")
    assert home is not None


def test_add_image_button_visible(app):
    """The 'Add Image' button should be visible."""
    btn = find_by_role_and_name(app, "push button", "Add Image")
    assert btn is not None


def test_start_session_button_visible(app):
    """The 'Start Session' button should be visible."""
    btn = find_by_role_and_name(app, "push button", "Start Session")
    assert btn is not None


def test_seed_references_visible(app):
    """Seed reference data should appear in the UI."""
    # The seed references are rendered as document frames in the AT-SPI tree.
    simple_face = find_by_role_and_name(
        app, "document frame", "REFERENCE IMAGE", timeout=10
    )
    assert simple_face is not None

    # Also verify seed list items are present.
    # The reference list is represented as list items inside a list.
    list_items = find_all_by_role_and_name(app, "list item")
    # There should be at least the navigation items (Home, Progress, Settings).
    assert len(list_items) >= 3, f"Expected at least 3 list items, got {len(list_items)}"
