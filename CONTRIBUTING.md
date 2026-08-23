# Contributing to Daranor RPG

Bug reports, accessibility improvements, tests, documentation, and focused game fixes are welcome.

## Before starting

- Search existing issues before opening a duplicate.
- Use the bug form for gameplay or website problems.
- For a substantial engine, data-model, story, or asset change, open an issue first so scope and compatibility can be discussed.
- Do not include private manuscripts, credentials, personal data, or material you are not authorized to share publicly.

## Local setup

Install Node.js 22 or newer and Chrome or Chromium. This repository has no third-party npm dependencies.

```sh
npm run dev
```

The launcher will be available at <http://127.0.0.1:4173/>.

## Architecture boundaries

- Put shared runtime behavior in `packages/engine/`.
- Put shared markup and styles in `packages/ui/`.
- Keep story, maps, balance, encounters, and campaign-specific assets in `games/<campaign>/`.
- Put byte-identical runtime media used by both campaigns in `shared/assets/`.
- Do not copy the shared engine or UI into a campaign.
- Do not edit generated `dist/` files; change their source and rebuild.
- Do not use SVG for newly generated or replacement visual assets unless maintainers explicitly agree to it.

Preserve save compatibility when possible. A change to save shape requires an explicit version and migration path.

## Verification

For game data or asset changes:

```sh
npm run validate
```

For shared engine/UI behavior or before submitting a pull request:

```sh
npm test
```

Functional tests require Chrome or Chromium. Set `CHROME_PATH` if the browser is installed somewhere the test harness does not detect.

## Licensing and provenance

By submitting a contribution, you confirm that you have the authority to provide it under the repository's applicable license:

- Software, tests, automation, and tooling: MIT.
- Story, campaign data, documentation, art, and audio: CC BY 4.0.

Do not add third-party material without documenting its source, author, license, and any required attribution in `THIRD_PARTY_NOTICES.md`. Material with terms incompatible with public redistribution will not be accepted.

For AI-assisted media, update `AI-ASSET-PROVENANCE.md` with the provider/tool, model when known, affected files, human edits, source material, and the terms relied upon. AI assistance does not remove the requirement that you have authority to submit the result.

## Pull request checklist

- Keep the change focused and explain the player-visible result.
- Identify the campaign or shared system affected.
- Add or update tests for behavior changes.
- Run the appropriate validation and tests.
- Note any save migration, asset provenance, attribution, accessibility, or mobile impact.
- Do not commit `dist/`, `.compat/`, temporary files, or local logs.
