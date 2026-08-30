# Releasing

A release is a one-line change: edit `VERSION` on `main`.

```
0.1.0
```

The tag is that line with a `v` in front — `0.1.0` becomes `v0.1.0`. Nothing else
carries the version, so there is no second place to forget.

## What happens

`.github/workflows/release.yml` runs when `VERSION` changes on `main`:

1. **Read the version.** It must look like `1.2.3`, optionally with a pre-release
   suffix (`1.2.3-rc.1`); anything else stops the run rather than creating a tag
   nobody meant. If the tag already exists the run stops here, so touching the
   file without changing it is harmless.
2. **Build**, once per platform, on `ubuntu-latest`:
   - `anime-craft-<version>-linux-amd64.tar.gz` — a tar so the executable bit
     survives the download.
   - `anime-craft-<version>-windows-amd64.zip` — cross-compiled, which works
     because the Windows build is pure Go (`CGO_ENABLED=0`). Both platforms
     still need GTK on the runner all the same: `go install wails3` does not
     compile without it, and generating the bindings then parses Go packages
     that import the toolkit.
3. **Tag and release.** The tag is created on the commit that changed `VERSION`,
   and both archives are attached to a GitHub release.
4. **Write the changelog.** The same notes are prepended to `CHANGELOG.md` and
   committed back to `main`.

A pull request that touches `VERSION` or the workflow itself runs steps 1 and 2
and stops: the binaries are built and left as workflow artifacts, so a change to
the release machinery is proved before it is merged rather than on the release
it breaks. Nothing is tagged or published from a pull request.

## The changelog

`CHANGELOG.md` is written by the workflow, not by hand. The list of pull requests
is asked of GitHub once — `POST /releases/generate-notes`, which returns the
titles, authors and links of everything merged since the previous tag — and used
twice: as the release body and as the changelog entry. Two lists generated
separately would eventually disagree about the same release.

Which means the way to improve the changelog is to write better pull request
titles, since those *are* the changelog. A repository-level `.github/release.yml`
can group them into Features / Fixes sections by label if that becomes worth it.

Editing `CHANGELOG.md` by hand is fine for fixing prose in an old entry. Two
things it will not tolerate: losing the `<!-- Releases are added below this line
-->` marker, which makes the next release fail rather than guess where its entry
belongs, and a heading for a version that is already there, which the next run
will leave alone rather than duplicate.

## Choosing the number

Ordinary [semantic versioning](https://semver.org): patch for fixes, minor for
features, major once there is something to break. The app is pre-1.0, so `0.x.y`
minor bumps are where features go.

## When something goes wrong

- **The build failed on something unrelated.** Re-run the workflow by hand
  (`workflow_dispatch`); it will pick the version out of `VERSION` again and, as
  long as no tag was created, release it.
- **A release went out wrong.** Delete the release *and* its tag on GitHub, then
  bump `VERSION` to the next patch and let it run again. Re-using a version that
  someone may already have downloaded is worse than spending a number.
- **The release went out but the changelog did not.** Re-running will not fix it:
  the tag now exists, so the workflow correctly decides there is nothing to do.
  Run `.github/scripts/prepend_changelog.py <tag> <notes-file> CHANGELOG.md` by
  hand, or paste the entry in — nothing downstream depends on it.

## What is not in the release

The Python inference service in `inference/`. The desktop app connects to it over
gRPC at a default local address and degrades gracefully when it is not there:
drawing, layers, saving and resuming work from the downloaded binary alone, while
line-art extraction and drawing feedback need the service running. Packaging the
two together would mean shipping a Python runtime and model weights, which is a
separate decision from shipping the app.
