import sharp from "sharp";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, "../..");
const source = join(repoRoot, "public/vao/releases/0.5.0-2/workspace/payload/media/images/app-icon-source.png");
const output = join(repoRoot, "public/social-card.png");
const icon = await sharp(source).resize(360, 360, { fit: "contain" }).png().toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 4, background: { r: 243, g: 240, b: 233, alpha: 1 } } })
  .composite([
    { input: { create: { width: 500, height: 630, channels: 4, background: { r: 141, g: 92, b: 62, alpha: 1 } } }, left: 700, top: 0 },
    { input: icon, left: 770, top: 135 },
    { input: icon, left: 170, top: 135, blend: "over" },
  ]).png().toFile(output);
console.log(`Wrote ${output}`);
