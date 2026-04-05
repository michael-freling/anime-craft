"""E2E tests for page navigation accessibility using AT-SPI.

These tests verify that sidebar navigation elements are exposed in the
accessibility tree with correct names.

WebKit2GTK renders NavLink elements as 'form' role nodes with accessible
names matching their text content (e.g., form: 'Home', form: 'Progress').

NOTE: These tests must NOT change app state (no clicking), because all
tests share one session-scoped app instance.
"""

from helpers import find_by_role_and_name


def test_sidebar_has_home_link(app):
    """The sidebar should expose a 'Home' navigation element."""
    nav = find_by_role_and_name(app, "form", "Home", timeout=15)
    assert nav is not None


def test_sidebar_has_progress_link(app):
    """The sidebar should expose a 'Progress' navigation element."""
    nav = find_by_role_and_name(app, "form", "Progress", timeout=10)
    assert nav is not None


def test_sidebar_has_settings_link(app):
    """The sidebar should expose a 'Settings' navigation element."""
    nav = find_by_role_and_name(app, "form", "Settings", timeout=10)
    assert nav is not None


def test_home_page_heading(app):
    """The home page should show 'Anime Craft' as a document frame."""
    # WebKit2GTK exposes the <h1> content within a 'document frame' role
    frame = find_by_role_and_name(app, "document frame", "Anime Craft", timeout=10)
    assert frame is not None
