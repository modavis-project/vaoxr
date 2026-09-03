import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, "../..");
const sourceRoot = process.env.POSITIVXR_UNITY_SOURCE;
if (!sourceRoot) throw new Error("Set POSITIVXR_UNITY_SOURCE to the read-only Unity project root.");
const input = join(sourceRoot, "Assets/Animations/pachelbel.anim");
const output = resolve(process.env.POSITIVXR_MEDIA_OUTPUT || join(repoRoot, "work/asset-pipeline/media"), "performance/pachelbel.json");
const yaml = await readFile(input, "utf8");
const eulerSection = yaml.slice(yaml.indexOf("  m_EulerCurves:"), yaml.indexOf("  m_FloatCurves:"));
const blocks = eulerSection.split(/^ {2}- curve:/m).slice(1);
const tracks = blocks.map((block) => {
  const path = block.match(/^ {4}path: (.+)$/m)?.[1]?.trim();
  if (!path || (!path.startsWith("M1.") && !path.startsWith("REG."))) return undefined;
  const keys = [...block.matchAll(/^ {8}time: ([\d.e+-]+)\n {8}value: \{x: ([\d.e+-]+), y: ([\d.e+-]+), z: ([\d.e+-]+)\}$/gm)]
    .map((match) => [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])]);
  if (!keys.length) return undefined;
  const base = keys[0].slice(1);
  return { node: path, property: "rotationEulerDeltaDegrees", interpolation: "linear", baseSourceEuler: base, keys: keys.map(([time, x, y, z]) => [time, x - base[0], y - base[1], z - base[2]]) };
}).filter(Boolean);

const timeline = {
  schemaVersion: 1,
  contentVersion: "2026.09.02-performance.2",
  id: "pachelbel",
  source: "Assets/Animations/pachelbel.anim",
  sourceDurationSeconds: 30,
  audioDurationSeconds: 34.56,
  mapping: {
    mode: "native-time-clamp",
    audioTimeAtAnimationStartSeconds: 0,
    measuredAudibleStartSeconds: 0.086372,
    measuredAudibleEndSeconds: 30.975442,
    measuredTrailingSilenceSeconds: 3.584558,
    measurement: "FFmpeg silencedetect at -42 dB with an 80 ms minimum duration",
  },
  tracks,
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(timeline)}\n`);
console.log(`Extracted ${tracks.length} performance tracks to ${output}`);
