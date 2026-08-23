# Daranor RPG

Daranor RPG is a browser-playable adaptation of the Daranor trilogy. This monorepo contains:

- **DreamQuest**, the first campaign.
- **ProphecyQuest + SwordQuest**, a combined sequel campaign.
- One shared game engine, interface, asset library, build system, and test harness.

The website build is the primary way to play. Each campaign is also emitted as a self-contained folder that can be packaged for offline use.

## Quick start

Requirements:

- [Node.js](https://nodejs.org/) 20 or newer.
- Google Chrome or Chromium for the functional test suite.

No third-party npm packages are required.

```sh
npm run dev
```

This builds the project and serves the launcher at <http://127.0.0.1:4173/>. The individual games are available at:

- <http://127.0.0.1:4173/dreamquest/>
- <http://127.0.0.1:4173/prophecy-sword/>

Use a different port with:

```sh
npm run dev -- --port 8080
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Build the launcher and both self-contained games into `dist/`. |
| `npm run dev` | Build once, then serve `dist/` locally. |
| `npm start` | Serve an existing `dist/` build. |
| `npm run validate` | Build and validate both campaign data sets and runtime asset references. |
| `npm test` | Build, validate, and run both functional browser suites. |

`dist/` is generated and is not committed.

## Offline distributions

Run `npm run build`, then package either `dist/dreamquest/` or `dist/prophecy-sword/`. Each folder contains its own HTML, JavaScript, CSS, media, and an `asset-manifest.json` with file hashes. Serving the folder over local HTTP gives the most consistent browser behavior:

```sh
npm start
```

## Repository layout

```text
games/
  dreamquest/          DreamQuest campaign data and unique assets
  prophecy-sword/      ProphecyQuest/SwordQuest data and unique assets
packages/
  engine/              Canonical shared runtime
  ui/                  Canonical shared game interface and styles
  launcher/            Website launcher
shared/assets/         Runtime media shared by both campaigns
tests/                 Campaign-specific functional tests
tools/                 Dependency-free build, serve, migration, and validation tools
dist/                  Generated website and offline-ready outputs
```

Campaign story, maps, balance, encounters, and campaign-only media belong under `games/<campaign>/`. Runtime behavior belongs in `packages/engine/`; shared presentation belongs in `packages/ui/`; byte-identical media used by both games belongs in `shared/assets/`.

## Saves

Browser saves use local storage. The games also support JSON export and import, which is the safest way to move progress between browsers or retain a backup before an update.

## Reporting bugs

Please use the [bug report form](https://github.com/billpottle/daranor-rpg/issues/new?template=bug.yml). Include the game, browser, device, build or commit, and reproducible steps. Save files and screenshots are helpful but optional.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Shared engine changes should be tested against both campaigns.

## Licensing

This is a multi-license repository designed for public reuse:

- Shared software and tooling are available under the [MIT License](LICENSES/MIT.txt).
- Original story, campaign data, documentation, art, and audio are available under [Creative Commons Attribution 4.0 International](LICENSES/CC-BY-4.0.txt), subject to the scope and exceptions in [LICENSE.md](LICENSE.md).
- Third-party and AI-assisted material is described in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [AI-ASSET-PROVENANCE.md](AI-ASSET-PROVENANCE.md).
