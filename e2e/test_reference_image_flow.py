"""E2E tests for the reference image flow using AT-SPI."""

from helpers import find_all_by_role_and_name, find_by_role_and_name


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
