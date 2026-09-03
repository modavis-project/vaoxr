# Instrument VAO release history

vaoXR 0.1.0 reads instrument release `0.5.0-2`, using VAO Standard 0.5.0.
The software, dataset, and standard have independent versions.

## Revision 2: calibration and interaction metadata

Revision 2 records facts previously held in the Unity source or application
reports:

- MIMO identity and closed-case dimensions for museum inventory 243:
  2.49 m high, 1.17 m wide, and 0.80 m deep.
- Canonical glTF coordinates correctly identified as unitless source units.
- Inferred calibration of 0.223 m per source unit, recovered from the Unity
  scene and cross-checked against MIMO.
- Separate open-configuration scan bounds; its 1.924558 m width includes doors
  and projections and does not replace the museum's closed-case width.
- A physical-calibration evidence record in the preservation payload.
- Portable mappings for 45 `M1.*` key controls and five `REG.*` stop controls.
- Stop order: Gedackt 8′, Principal 4′, Principal 2′, Quint 2⅔′, Regal 8′.
- Browser, MIDI, WebXR hand-joint, and controller input semantics.
- Native-time performance synchronization: animation follows audio through
  30 seconds, then clamps while the recording's trailing silence finishes.

These belong in the VAO because they affect interpretation by other readers.
Keeping measured dimensions separate from inferred calibration avoids false
precision and double scaling.

## Original 0.5.0 migration

The initial migration established stable identifiers for the VAO, release,
entities, realizations, distributions, carriers, and profiles. It introduced
a small bootstrap carrier and a complete preservation-closure carrier, with
a mutable discovery pointer to the immutable release.

Seven profiles describe core data, dynamic delivery, scientific provenance,
sampled playback, multimodal synchronization, physical topology, and spatial
recordings. The release binds to MODAVIS Ontology Network 0.1.0.

All 225 stop/note mappings retain Opus/AAC alternatives. VAO signal regions
supply the sustain-loop start, exclusive end, and crossfade duration. Every
one of the 473 payload realizations has an exact byte size and SHA-256 digest.

## Files and acquisition

The deployed data release is
[vaoxr.modavis.org/vao/releases/0.5.0-2](https://vaoxr.modavis.org/vao/releases/0.5.0-2/vao-release.json).

- `public/vao/current.json`: mutable discovery pointer.
- `content/vao-index.json`: runtime projection of the exact manifest.
- `public/vao/releases/0.5.0-2/vao-manifest.json`: canonical manifest.
- `public/vao/releases/0.5.0-2/vao-release.json`: carrier inventory.
- `public/vao/releases/0.5.0-2/workspace/`: preservation workspace.
- `positivxr-bootstrap-0.5.0.vao`: 2,054,610-byte bootstrap carrier.
- `positivxr-preservation-0.5.0.vao`: 57,138,505-byte preservation carrier.

Carriers and workspace payload are obtained with `npm run media:fetch`, not
stored in the software Git repository. Revision 1 and unpublished later
dataset drafts are not bundled with vaoXR 0.1.0.

## Application-only changes

Markerless placement, browser guidance, PWA caching, controller scaling,
light controls, fingertip hit volumes, and decoded-buffer loop preparation
are application behavior. They do not change preserved source bytes.

The calibrated GLB/USDZ AR derivatives have separate source/output hashes in
`public/media/reports/organ-ar.json`. They are not retroactively inserted into
the immutable carrier.

## Validation and future revisions

Run `npm run vao:validate` to check both carriers with the pinned official
VAO 0.5.0 validator.

Never overwrite a published release directory. Changed source bytes, semantic
entities, physical observations, signal regions, or portable mappings require
a new dataset revision, rebuilt and validated carriers, and only then an
updated discovery pointer and runtime index.
