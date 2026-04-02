"""E2E tests for page navigation using AT-SPI.

These tests verify that sidebar navigation links work and that
each page renders the expected heading content.
"""

from helpers import click_element, find_by_role_and_name, find_clickable_by_name


def _navigate_to(app, nav_name, timeout=10):
    """Click a sidebar navigation link by its name.

    WebKit2GTK may expose <a> elements under different AT-SPI roles
    (link, list item, etc.), so we search by name across all roles and
    pick the first one that is actionable.
    """
    element = find_clickable_by_name(app, nav_name, timeout=timeout)
    click_element(element)


def test_navigate_to_progress_page(app):
    """Clicking the 'Progress' nav link should show the Progress heading."""
    _navigate_to(app, "Progress")
    heading = find_by_role_and_name(app, "heading", "Progress", timeout=10)
    assert heading is not None


def test_navigate_to_settings_page(app):
    """Clicking the 'Settings' nav link should show the Settings heading."""
    _navigate_to(app, "Settings")
    heading = find_by_role_and_name(app, "heading", "Settings", timeout=10)
    assert heading is not None


def test_navigate_back_to_home(app):
    """From another page, clicking 'Home' should return to home page content."""
    # Make sure we are NOT on the home page first.
    _navigate_to(app, "Settings")
    find_by_role_and_name(app, "heading", "Settings", timeout=10)

    # Now navigate back home.
    _navigate_to(app, "Home")

    # The home page shows "Anime Craft" as its <h1> heading.
    heading = find_by_role_and_name(app, "heading", "Anime Craft", timeout=10)
    assert heading is not None
