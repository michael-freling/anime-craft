"""E2E tests for page navigation accessibility using AT-SPI.

These tests verify that sidebar navigation elements are exposed in the
accessibility tree with correct names and roles, without clicking them.
Actual navigation clicking is covered by the Playwright e2e tests.

NOTE: These tests must NOT change app state (no clicking), because all
tests share one session-scoped app instance.
"""

from helpers import find_all_by_name, find_by_role_and_name


def test_sidebar_has_home_link(app):
    """The sidebar should expose a 'Home' navigation element."""
    elements = find_all_by_name(app, "Home")
    assert len(elements) > 0, "No element named 'Home' found in AT-SPI tree"


def test_sidebar_has_progress_link(app):
    """The sidebar should expose a 'Progress' navigation element."""
    elements = find_all_by_name(app, "Progress")
    assert len(elements) > 0, "No element named 'Progress' found in AT-SPI tree"


def test_sidebar_has_settings_link(app):
    """The sidebar should expose a 'Settings' navigation element."""
    elements = find_all_by_name(app, "Settings")
    assert len(elements) > 0, "No element named 'Settings' found in AT-SPI tree"


def test_home_page_heading(app):
    """The home page should show 'Anime Craft' as a heading."""
    heading = find_by_role_and_name(app, "heading", "Anime Craft", timeout=10)
    assert heading is not None
