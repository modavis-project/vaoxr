# Changelog

## 0.2.0 — 2026-11-19

- Inspect local VAO 0.5.0 and 0.6.0 manifests and carriers from the VAO Standard
  page. Show declared profiles, including MMIC 1.0.0.
- Preview supported embedded audio after checking the manifest and sample against
  their SHA-256 digests.
- Include the deployed Cuntz sustain-loop repair and preserve the initial volume
  on a first visit. The curated instrument still uses data release 0.5.0-2.
- Update the web build and test dependencies.

## 0.1.0 — 2026-09-03

Initial public software release.

- VAO Standard 0.5.0 reader with exact-byte verification and pinned instrument
  release 0.5.0-2.
- Interactive 3D model, audio-clock-driven performance animation, and four
  room recordings.
- Sampled 45-note manual, five stops, Opus/AAC fallback, and sustain looping
  from VAO signal regions.
- Markerless mobile AR and a dedicated Meta Quest 3 passthrough experience.
- Experimental Quest hand-playing and stop interaction, controller scaling,
  and an adjustable spotlight.
- Installable PWA, offline shell, opt-in stop packs, and browser capability
  guidance.
- Reproducible, checksum-verified demo-media setup, automated tests, and
  standalone Node/Docker deployment.

Software versions are independent of instrument-data and VAO-standard versions.
See `docs/VAO_0.5.0_CHANGELOG.md` for the instrument release history.
