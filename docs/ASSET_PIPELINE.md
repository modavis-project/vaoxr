# Asset pipeline

## Use the pinned demo

`npm run media:fetch` obtains instrument release `0.5.0-2`, validates its
carrier hashes and all 473 payload realizations, and downloads the separately
checksummed GLB/USDZ delivery models and application images. It does not need
Unity or Blender. The software archive excludes these media files.

The exact manifest, carrier inventory, runtime index, and AR report are checked
into this repository. Existing files with different bytes cause setup to fail;
move them aside deliberately before retrying.

## Regenerate derivatives

Regeneration is optional and requires separately supplied, read-only Unity
sources. Export `POSITIVXR_UNITY_SOURCE` to that project root; there is no
workstation-specific default. `.env.example` lists the available variables,
but the shell scripts do not load it automatically.

`npm run assets:build` uses Blender, macOS `sips`, and glTF Transform to export
the model, textures, room images, and historical marker. Set `BLENDER_BIN`
when Blender is not on PATH. `npm run media:seed` uses FFmpeg for sampled
Opus/AAC ranks. `npm run performance:build` extracts Unity key and stop tracks.

These authoring steps write media to `work/asset-pipeline/media` by default;
`POSITIVXR_MEDIA_OUTPUT` can override it. Never point this at an immutable
published release. Carrier authoring and the original Unity project are outside
this software release. A changed payload requires a new VAO data revision and
new carrier hashes before the runtime index is advanced.

Do not commit Unity caches, build products, Vuforia credentials, original
high-resolution masters, or AppleDouble sidecars.

## Playback and looping

Each sampled rank contains 45 six-second, 48 kHz stereo notes in Opus and AAC.
The VAO `SignalRegion` defines sustain start, exclusive end, and crossfade;
the sample mapping defines envelope release.

After SHA-256 verification and decoding, the engine maps marker times to the
decoded sample rate. A raised-cosine overlap blends the sustain head into its
tail once, and native Web Audio looping starts after the overlapped head.
The attack plays once. Note-off applies the release envelope. Invalid marker
ranges are rejected. Preservation bytes remain unchanged.

The normal decoded cache is bounded at 96 MiB. Quest hand-playing prewarms one
45-note stop in a 116 MiB cache; other ranks load notes on demand. All five
rank manifests and centre notes are checked before placement.

## Models and animation

The canonical GLB retains `M1.*` key and `REG.*` stop nodes. Static meshes
above 100,000 faces use a 0.65 collapse ratio in the source export; animated
parts are excluded. Reports record source/output hashes and face counts.

Unity curves become a 34-track web timeline. Audio time drives animation at
native speed through 30 seconds, then clamps while the 34.56-second recording
finishes. The extra duration is a measured silent/reverberant tail, not a
different performance tempo.

`npm run ar:model` reads the pinned canonical realization, applies the
0.223 m/source-unit calibration, centres X/Z, and aligns the base to Y=0.
It preserves topology and normals, embeds a 2K JPEG texture, bakes the
performance, and uses Draco transfer compression.

`npm run ar:usdz` exports a lower-geometry iOS derivative using Blender.
These commands write application delivery assets under `public/media/`;
their adjacent report records source and output hashes. They do not rewrite
the VAO carrier.

The closed-case MIMO width (1.17 m) is distinct from the open-door delivery
width (about 1.92 m). The derivative is already in metres and must not be
calibrated a second time.

The marker compiler exists only to reproduce the historical VAO realization.
The current mobile and Quest runtime uses user-selected floor placement.

## Budgets

- Canonical GLB: at most 15 MiB.
- Quest/mobile GLB: at most 5 MiB; iOS USDZ: at most 12 MiB.
- Texture: one 2K delivery image.
- PWA precache: shell, metadata, and small icons.
- Five separately downloadable and removable stop packs.
