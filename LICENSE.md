# Daranor RPG licensing guide

This repository uses multiple licenses. The license depends on the file's role. A specific notice stored with a file takes precedence over this guide.

## MIT-licensed software

The following implementation, test, and project-automation material is licensed under the [MIT License](LICENSES/MIT.txt):

- `packages/engine/**`
- `packages/ui/**`
- `packages/launcher/**`
- `tools/**`
- `tests/**`
- `.github/**`
- `package.json`

Copyright © 2026 Daranor RPG contributors.

## CC BY 4.0 game content

To the extent that Daranor RPG contributors own or are authorized to license the applicable copyright and similar rights, the following original game and documentation material is licensed under the [Creative Commons Attribution 4.0 International Public License](LICENSES/CC-BY-4.0.txt):

- `games/**`, including campaign data, story text, maps, encounter data, balance data, and campaign-specific media.
- `shared/assets/**`, including shared art and audio, except where a different source or license is identified.
- Original repository documentation other than verbatim license texts.

Suggested attribution:

> Daranor RPG, by Bill Pottle and Daranor RPG contributors, licensed under CC BY 4.0. Source: https://github.com/billpottle/daranor-rpg

When sharing an adaptation, identify that you changed the material and retain a link to the license and source when reasonably practical. Attribution does not imply endorsement.

## AI-generated music

The music files identified as Google generative-AI output in [AI-ASSET-PROVENANCE.md](AI-ASSET-PROVENANCE.md) are offered under CC BY 4.0 only to the extent they are copyrightable and only to the extent applicable rights are owned by, or licensable by, Daranor RPG contributors.

No representation is made that AI-generated output is copyrightable in every jurisdiction, that contributors hold exclusive rights in it, or that the files are free of every possible third-party claim. No rights in a generation service, model, or provider identity are granted by this repository.

`shared/assets/generated/audio/dreamquest-escape.mp3` is a separately procedurally composed and rendered project track and is licensed under CC BY 4.0 as original project content.

## Third-party material

Material identified in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) remains subject to its stated terms. The repository's MIT and CC BY licenses do not replace a third party's license or grant rights that contributors do not have.

The verbatim license texts in `LICENSES/` are included for reference and remain subject to their own terms and notices.

## Contributions

Unless a maintainer agrees otherwise in writing before submission:

- Contributions to software, tests, build configuration, and tooling are submitted under MIT.
- Contributions to story, campaign data, documentation, art, and audio are submitted under CC BY 4.0.

Contributors retain copyright in their contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for provenance and third-party-material requirements.

The included licenses grant only the rights stated in their terms. They do not provide an endorsement or any warranty.
