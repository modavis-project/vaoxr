# Verification

## Release checks

The 0.2.0 checks on 19 November 2026 covered the production build, TypeScript,
ESLint, Knip, 54 unit and asset tests, four media-fetch tests, and the curated
VAO carrier validation. The full npm audit reported zero known vulnerabilities.

Run `npm ci` and `npm run media:fetch` before the checks below.

```bash
npm run build
npm run typecheck
npm run lint
npm run deadcode
npm test
npm run test:media
npm audit
npm run vao:validate
```

The unit and asset suite covers local carrier inspection, audio preview,
VAO sustain-loop preparation,
performance-clock mapping, Quest collision and controller tools, browser
capabilities, offline packs, delivery-model provenance, and all 473 payload
sizes and hashes. The media-fetch tests cover integrity failures, unsafe paths,
symlinks, unexpected archive entries, and preservation of existing files.

The pinned official VAO 0.5.0 validator checks the bootstrap and
preservation-closure carriers against the release descriptor and exact manifest.

## Browser checks

```bash
npx playwright install chromium firefox
npm run test:e2e
```

The suite builds and starts the production server, then runs route,
media-budget, moving-key preview, Firefox guidance, player, PWA, offline-shell,
and HTTP-header assertions in desktop Chromium, Pixel 7 emulation, and Firefox.
Device-specific assertions are skipped where that browser does not support them.

The release browser run passed 33 scenarios with three browser-specific skips,
using Node 26.0.0 and Playwright 1.62.1 on macOS. It opened both VAO versions
and decoded the synthetic MMIC roll's verified WAV preview. Animation checks
sample the clock inside the page and account for the 30-second clip looping
back to its start.

Desktop emulation cannot establish physical floor detection, hand accuracy,
motion-to-sound latency, passthrough appearance, native iOS/Android AR behavior,
or thermal stability. These require real-device tests. Quest hand-playing
remains experimental; see `QUEST_HAND_PLAYING.md`.

## Release boundary

Validation establishes file identity and implemented software behavior. It does
not independently verify historical attribution, source-media permissions, or
the accuracy of an inferred physical calibration.

Audit the complete npm dependency tree. Vinext and React Server Components are
build dependencies that also affect server output. Keep the lockfile and rerun
the checks after dependency updates.
