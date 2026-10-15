# Contributing.

[Back to the README](../README.md).

This guide covers generating, verifying, and releasing the Excalidraw libraries. Run all commands from the repository root; file paths below are relative to that directory.

Generated files are excluded from Git. Local builds write them to `outputs/`.

## Generation and verification.

Bun 1.4.3 is used as the runtime and package manager. The browser verification also requires a local installation of Google Chrome.

If Chrome is not installed, run `bunx --bun playwright install chrome`. On Linux CI, use `bunx --bun playwright install --with-deps chrome` to include system dependencies.

```sh
git submodule update --init --recursive
bun install --frozen-lockfile
bun run build
bun run verify
bun run preview
```

The original repositories are pinned Git submodules in `sources/` and remain unmodified. Initialize them with the command above after cloning, or clone this repository with `git clone --recurse-submodules <repository-url>`. Exact Git revisions, the Tabler version, the SVG file list, source SHA-256 checksums, and conversion failures are recorded in `outputs/conversion-report.json`.

The build script creates a local converter bundle with more precise curve sampling. The adapter preserves inherited SVG styles and `currentColor`, converts opacity to Excalidraw's scale, and replaces the legacy `draw` type with the current `line` type. Filled paths with multiple contours are joined by doubled, invisible bridges, preserving transparent holes on any background.

Verification checks icon counts against the source directory, unique identifiers, complete variants, geometry, and import through Excalidraw's `loadLibraryFromBlob` and `restoreLibraryItems` APIs. It then renders every icon using `exportToSvg` and compares its alpha channel with the original SVG at 192 × 192 pixels. Results and library SHA-256 checksums are recorded in `outputs/verification-report.json`. Pixel comparisons include differences caused by curve approximation and antialiasing; they do not prove identical geometry.

Intermediate files and comparison assets are stored in `work/`. Dependencies are pinned in `bun.lock`.

All 6,238 icons from Tabler 3.49.0 were successfully imported into Excalidraw 0.18.1, preserving all 24,068 elements. The mean alpha coverage difference was 0.110%, with a maximum of 0.734%. Verification fails if any icon exceeds a 1% difference. The comparison sheet at `outputs/preview-comparison.png` shows selected originals and converted icons on a colored background.

## Dependency updates.

Use `bun run check-updates` to list available updates without changing files. Both update commands use `ncu.config.js`, which checks the latest stable versions through Bun. Its exception lists can limit individual packages to minor or patch updates when compatibility requires it; no exceptions are currently configured.

To update dependency versions, refresh the lockfile, and verify the result:

```sh
bun run force-updates
bun install
bun run build
bun run verify
bun run preview
```

`force-updates` updates `package.json` only and still respects the configured exceptions. Review and commit `package.json`, `bun.lock`, and any necessary compatibility changes together. These commands do not update the pinned source submodules.

## Releases.

The workflow in `.github/workflows/release.yml` runs when a tag matching `v*` is pushed. It checks out the pinned submodules, installs dependencies from `bun.lock`, builds the libraries, verifies every icon, and generates the preview. A release is published only after all steps succeed.

Release assets include the three `.excalidrawlib` files, both license notices, the conversion and verification reports, and the comparison preview. Keep the source code, lockfile, workflow, and submodule references in Git; distribute generated files through Releases.

Every release description includes the attribution in `.github/release-notes.md`, followed by automatically generated release notes.

After committing and pushing the release source to GitHub, create and push a version tag:

```sh
git tag -a v1.0.0 -m "Release v1.0.0."
git push origin v1.0.0
```

Use a new version tag for each release. The workflow uses GitHub's automatic token with `contents: write`; it does not require a personal access token.
