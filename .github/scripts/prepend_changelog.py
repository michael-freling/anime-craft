#!/usr/bin/env python3
"""Put a release's notes at the top of the changelog.

Called by .github/workflows/release.yml with the notes GitHub generated for
the release, so the changelog and the release page say the same thing rather
than being two lists of the same pull requests that drift apart.

    prepend_changelog.py v1.2.3 notes.md CHANGELOG.md [--date 2026-08-30]
"""

import argparse
import datetime
import pathlib
import re
import sys

# Everything above this line is the file's own preamble and is left alone;
# releases go directly below it, newest first.
SENTINEL = "<!-- Releases are added below this line, newest first. -->"


def fit_under_a_release_heading(notes: str) -> str:
    """Reshape GitHub's notes to sit beneath a `## <tag>` heading.

    They arrive headed `## What's Changed`, which is the same level as the
    release heading they are going under — as written, every release would read
    as a sibling of its own contents. That heading is dropped, because the
    release heading above already says what the list is, and any other
    second-level heading (`## New Contributors`) is pushed down one so it sits
    inside the release rather than beside it. Deeper headings — the categories
    GitHub adds when the repository configures them — already nest correctly and
    are left where they are.
    """
    lines = notes.strip().splitlines()
    if lines and re.match(r"^#+\s+What's Changed\s*$", lines[0]):
        lines = lines[1:]
    while lines and not lines[0].strip():
        lines = lines[1:]
    return "\n".join(
        "#" + line if re.match(r"^## \S", line) else line for line in lines
    )


def prepend(changelog: str, tag: str, notes: str, date: str) -> str:
    if SENTINEL not in changelog:
        raise ValueError(
            "CHANGELOG.md has lost its marker line, and guessing where a release "
            "belongs is how a changelog ends up in the wrong order. Put this line "
            f"back:\n{SENTINEL}"
        )

    heading = f"## {tag} — "
    if heading in changelog:
        # A re-run after a half-finished release should not say it twice.
        return changelog

    head, _, rest = changelog.partition(SENTINEL)
    entry = f"{heading}{date}\n\n{fit_under_a_release_heading(notes)}\n"
    return f"{head}{SENTINEL}\n\n{entry}\n{rest.lstrip()}"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tag", help="the release's tag, e.g. v1.2.3")
    parser.add_argument("notes", type=pathlib.Path, help="file holding the notes")
    parser.add_argument("changelog", type=pathlib.Path, help="the changelog to edit")
    parser.add_argument(
        "--date",
        default=datetime.datetime.now(datetime.timezone.utc).date().isoformat(),
        help="release date (defaults to today, UTC)",
    )
    args = parser.parse_args(argv)

    try:
        updated = prepend(
            args.changelog.read_text(),
            args.tag,
            args.notes.read_text(),
            args.date,
        )
    except ValueError as e:
        print(e, file=sys.stderr)
        return 1

    if updated == args.changelog.read_text():
        print(f"{args.tag} is already in {args.changelog}; leaving it alone.")
        return 0

    args.changelog.write_text(updated)
    print(f"Added {args.tag} to {args.changelog}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
