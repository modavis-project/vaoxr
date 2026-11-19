# Third-party code and data

## VAO Standard 0.5.0

`vendor/vao-standard-0.5.0/` contains an unmodified subset of the reference
validator, schemas, and documentation from
[VAO Standard v0.5.0](https://github.com/modavis-project/vao-standard/tree/v0.5.0),
commit `ad2d4f09115e7bc883ac987ae6b4b89c0b2871c2`.
Copyright 2026 Dominik Ukolov and contributors.

Reference software is Apache-2.0; documentation and semantic artifacts are
CC-BY-4.0. The upstream `LICENSE`, `NOTICE`, `REUSE.toml`, and complete license
texts are retained in that directory. Documentation links to files outside the
vendored subset should be followed in the upstream repository.

## VAO inspection fixtures

The test carriers in `tests/fixtures/vao/` use synthetic material from
[VAO Standard v0.6.0](https://github.com/modavis-project/vao-standard/tree/v0.6.0),
commit `9d477213eab90defa75bef0f44e0d292a83e68d9`. The 0.5.0 carrier and
1.0.0 MMIC roll carrier are copied byte for byte. The generic 0.6.0 carrier
was created from the released 0.5 workspace using the official migration
and packing tools. See the fixture directory for hashes and source paths.
MMIC synthetic fixture data are CC0-1.0, with Apache-2.0 for the bundled
reference code and environment lock as identified in the carrier. The
minimal fixture and migration provenance retain their declared rights.

## Draco

`public/draco/gltf/` contains the glTF Draco decoder distributed with Three.js
0.183.2. These JavaScript and WebAssembly files are unchanged.
[Draco](https://github.com/google/draco) is Copyright Google Inc. and distributed
under Apache-2.0. The complete license is in
`vendor/vao-standard-0.5.0/LICENSES/Apache-2.0.txt`.

## vinext

`worker/index.ts` and the build setup were adapted from the vinext starter.
Copyright (c) 2026 Cloudflare, Inc. The MIT license is reproduced in
`LICENSES/MIT-vinext.txt`.

## Zip.js

The local carrier inspector uses [Zip.js](https://github.com/gildas-lormeau/zip.js)
under the BSD-3-Clause license. See `LICENSES/BSD-3-Clause-zip.js.txt`.

## npm dependencies

Installed dependencies retain their own licenses. `package-lock.json` pins
their versions, registry integrity hashes, and available license declarations.
Their complete notices accompany the installed packages; they are not
relicensed by this repository.

## Instrument media and metadata

The Cuntz positive organ model, photographs, icons, recordings, samples,
animation, and AR derivatives are separate from this software. The source
archive excludes these files; `npm run media:fetch` downloads the pinned demo
assets from the deployed application. Making them available for the demo does
not grant a blanket reuse license.

The VAO manifests, runtime index, calibration records, and delivery reports
preserve the supplied identities, provenance, checksums, and rights statements.
Those source-specific statements take precedence over the software license.
See the `rights` records in
`public/vao/releases/0.5.0-2/vao-manifest.json` before redistributing media.
Obtain any additional permissions required for a new use from the relevant
rights holders.

Physical measurements are attributed to
[MIMO, museum inventory 243](https://mimo-international.com/MIMO/doc/IFD/OAI_ULEI_M0000243).
The model calibration is an inference from the Unity scene, not an independently
measured replacement for the museum dimensions.
