# vaoXR

[![Release](https://img.shields.io/github/v/release/modavis-project/vaoxr)](https://github.com/modavis-project/vaoxr/releases/tag/v0.1.0)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22280620.svg)](https://doi.org/10.5281/zenodo.22280620)
[![VAO 0.5.0](https://img.shields.io/badge/VAO-0.5.0-2C5F73)](https://github.com/modavis-project/vao-standard/tree/v0.5.0)
[![Code license](https://img.shields.io/badge/code-Apache--2.0-blue)](LICENSE)

vaoXR is an installable web application for exploring, hearing, playing, and
placing a historic positive organ. It uses a [Virtual Acoustic Object (VAO)](https://github.com/modavis-project/vao-standard)
to connect the instrument's 3D model, recordings, sampled stops, moving keys,
physical measurements, and provenance.

**Live application: [vaoxr.modavis.org](https://vaoxr.modavis.org)**

## Experiences

- **View:** inspect the 3D model and watch its keys follow a recorded performance.
- **Room:** compare recordings from four listening positions.
- **Play:** use a 45-note manual and five independently selectable sampled stops.
- **Mobile AR:** place the organ on a floor using WebXR, Android Scene Viewer,
  or iOS Quick Look, depending on device support.
- **Quest AR:** place the organ in passthrough, adjust its scale and lighting
  with controllers, and try direct hand interaction with keys and stops.
- **Offline:** install the PWA and download individual stop packs on demand.

The [VAO information page](https://vaoxr.modavis.org/standard) explains which
parts of the standard the application uses.

## Run locally

Requirements: Node.js 22.13 or newer, npm, and Python 3.11 or newer.

```bash
git clone https://github.com/modavis-project/vaoxr.git
cd vaoxr
git checkout v0.1.0
npm ci
npm run media:fetch
npm run dev
```

The media command downloads about 76 MB from the deployed application's pinned
VAO release and delivery assets. It verifies byte sizes and SHA-256 digests,
checks every carrier member, and refuses to overwrite different local files.
Run it before building or testing a fresh checkout. Subsequent runs reuse
verified files. Instrument media are downloaded separately and are not included
in the software archive or covered by its software license.

```bash
npm run build
npm run start
```

The production server listens on port 3000 by default. Set `HOST` and `PORT` to
override this. Device AR requires HTTPS or a trusted local development origin;
plain HTTP over a LAN address is not sufficient.

## Browsers and devices

Use Chrome on an ARCore-supported Android phone, Safari on iOS/iPadOS, or
[Meta Quest Browser](https://vaoxr.modavis.org/ar/quest) on Quest 3. The app
checks available XR features before starting a session. Firefox retains the
3D preview and displays guidance to use a supported browser for AR placement.
Native phone AR viewers have different audio, interaction, and offline support
from the in-page WebXR experience.

In Quest, choose **Watch performance** or the experimental **Play with hands**
mode. Aim at the floor and use a trigger or pinch to place the organ. Hands
play keys and toggle stops; controllers change scale and move or aim the
spotlight. Held keys use the VAO sustain-loop markers until contact ends.
See [Quest controls and implementation](docs/QUEST_HAND_PLAYING.md) for details
and the remaining physical-device acceptance checks.

Installation caches the application shell. Stop packs are opt-in, and browser
storage may be reclaimed. Installing the PWA does not make every model,
recording, or native AR viewer available offline.

## Verify

```bash
npm run typecheck
npm run lint
npm run deadcode
npm test
npm run test:media
npm audit
npm run vao:validate
```

The VAO validation command creates an isolated Python environment using the
pinned reference validator's hashed requirements. Browser tests are optional:

```bash
npx playwright install chromium firefox
npm run test:e2e
```

See [verification](docs/VERIFICATION.md) for test scope and limitations.

## Deploy

Run `npm run media:fetch` before building the Docker image. `Dockerfile` builds
the standalone Node server and runs it as an unprivileged user. The supplied
Compose file targets an existing reverse proxy on the external Docker network
`npm_default`; configure that network and an HTTPS proxy to container port
3000, or adapt the networking to your host.

```bash
docker compose up -d --build
```

No API keys, database, or external object-storage account are required to run
the application. The production instance is [vaoxr.modavis.org](https://vaoxr.modavis.org).

## Source and data versions

Software version **0.1.0** consumes instrument release **0.5.0-2**, which uses
VAO Standard **0.5.0**. These versions identify different works. The code keeps
the existing `PositivXR` data identifiers unchanged so archived files and
citations continue to resolve.

The repository includes release manifests, the runtime index, asset-pipeline
code, and a pinned subset of the official VAO validator. Large media, Unity
sources, local development history, and unpublished dataset revisions are not
part of this software release. See the [data changelog](docs/VAO_0.5.0_CHANGELOG.md)
and [asset pipeline](docs/ASSET_PIPELINE.md).

## Citation and rights

Ukolov, Dominik (2026). *vaoXR* (0.1.0). Zenodo.
[10.5281/zenodo.22280620](https://doi.org/10.5281/zenodo.22280620).
Machine-readable citation metadata is available in [CITATION.cff](CITATION.cff).

The DOI is reserved for this release; the Zenodo deposit remains a draft until
publication. The badge displays the reserved identifier; the DOI link becomes
active once that deposit is published.

Original code is licensed under [Apache-2.0](LICENSE); original documentation
is [CC BY 4.0](LICENSES/CC-BY-4.0.txt). [NOTICE](NOTICE) defines their file scope.
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the VAO standard, Draco,
vinext-derived code, and separately downloaded instrument media. These licenses
do not relicense instrument media or source-specific metadata.
