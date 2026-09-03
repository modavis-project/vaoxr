import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const [, , sourceRoot, mediaRoot] = process.argv;
const files = {
  organ: join(mediaRoot, "models/organ.glb"),
  roomPlan: join(mediaRoot, "images/room-plan.png"),
  marker: join(mediaRoot, "ar/ar-marker.jpg"),
  performance: join(mediaRoot, "audio/performance.mp3"),
};

async function describe(path) {
  const data = await readFile(path);
  return {
    bytes: (await stat(path)).size,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}

const report = {
  contentVersion: "2026.08.12-mvp.1",
  sourceRoot,
  generatedAt: new Date().toISOString(),
  files: Object.fromEntries(
    await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await describe(path)])),
  ),
};

await writeFile(join(mediaRoot, "reports/assets.json"), JSON.stringify(report, null, 2) + "\n");
const repoRoot = resolve(dirname(mediaRoot), "..");
const instrumentPath = join(repoRoot, "content/instrument.json");
const instrument = JSON.parse(await readFile(instrumentPath, "utf8"));
instrument.model.sha256 = report.files.organ.sha256;
await writeFile(instrumentPath, `${JSON.stringify(instrument, null, 2)}\n`);
console.log(`Wrote ${join(mediaRoot, "reports/assets.json")}`);
