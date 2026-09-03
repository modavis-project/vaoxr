import { createHash } from "node:crypto";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, "../..");
const sourceRoot = process.env.POSITIVXR_UNITY_SOURCE;
if (!sourceRoot) throw new Error("Set POSITIVXR_UNITY_SOURCE to the read-only Unity project root.");
const sourceDirectory = join(sourceRoot, "Assets/Resources/Audio");
const outputRoot = resolve(process.env.POSITIVXR_MEDIA_OUTPUT || join(repoRoot, "work/asset-pipeline/media"), "audio/stops");
const releaseMediaBase = "/vao/releases/0.5.0-2/workspace/payload/media";
const contentVersion = "2026.08.12-audio.1";
const notes = [36, 38, 40, 41, 43, ...Array.from({ length: 40 }, (_, index) => index + 45)];
const stops = [
  ["ged", "Gedackt 8′"], ["princ4", "Principal 4′"], ["princ2", "Principal 2′"],
  ["qui223", "Quint 2⅔′"], ["reg8", "Regal 8′"],
];

async function sha256(path) { return createHash("sha256").update(await readFile(path)).digest("hex"); }
function runFfmpeg(argumentsList) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...argumentsList], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`ffmpeg failed with status ${result.status}`);
}

await mkdir(outputRoot, { recursive: true });
for (const [stopId, label] of stops) {
  const stopDirectory = join(outputRoot, stopId);
  await mkdir(stopDirectory, { recursive: true });
  const assets = [];
  for (const midi of notes) {
    const recordedTake = join(sourceDirectory, `4010243_${stopId}_${midi}_0.wav`);
    const plainName = join(sourceDirectory, `4010243_${stopId}_${midi}.wav`);
    const source = await access(recordedTake).then(() => recordedTake).catch(() => plainName);
    const opusPath = join(stopDirectory, `${midi}.opus`);
    const aacPath = join(stopDirectory, `${midi}.m4a`);
    const common = ["-i", source, "-map_metadata", "-1", "-vn", "-t", "6", "-ar", "48000", "-ac", "2"];
    runFfmpeg([...common, "-c:a", "libopus", "-b:a", "80k", "-vbr", "on", "-application", "audio", opusPath]);
    runFfmpeg([...common, "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", aacPath]);
    const [opusInfo, aacInfo, sourceChecksum, opusChecksum, aacChecksum] = await Promise.all([
      stat(opusPath), stat(aacPath), sha256(source), sha256(opusPath), sha256(aacPath),
    ]);
    assets.push({
      midi,
      opusUrl: `${releaseMediaBase}/audio/stops/${stopId}/${midi}.opus`,
      aacUrl: `${releaseMediaBase}/audio/stops/${stopId}/${midi}.m4a`,
      bytes: { opus: opusInfo.size, aac: aacInfo.size },
      checksum: { source: sourceChecksum, opus: opusChecksum, aac: aacChecksum },
      realizations: {
        opus: `urn:vaoxr:realization:media:audio:stops:${stopId}:${midi}:opus`,
        aac: `urn:vaoxr:realization:media:audio:stops:${stopId}:${midi}:m4a`,
      },
      sampleRate: 48000,
      durationSeconds: 6,
      loop: { startSeconds: 1.5, endSeconds: 5.6, crossfadeSeconds: 0.08 },
    });
  }
  const manifest = {
    schemaVersion: 1, contentVersion, stopId, label, packVersion: "1",
    codecs: ["audio/ogg; codecs=opus", "audio/mp4; codecs=mp4a.40.2"],
    totalBytes: {
      opus: assets.reduce((sum, asset) => sum + asset.bytes.opus, 0),
      aac: assets.reduce((sum, asset) => sum + asset.bytes.aac, 0),
    },
    notes: assets,
  };
  await writeFile(join(stopDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Generated ${label}: ${assets.length} notes`);
}
