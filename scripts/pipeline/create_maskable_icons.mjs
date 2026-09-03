import sharp from "sharp";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

for (const size of [192, 512]) {
  const inset = Math.round(size * 0.2);
  const artwork = await sharp(resolve(root, `public/icon-${size}.png`))
    .resize(size - inset * 2, size - inset * 2, { fit: "contain" })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: "#38402c" },
  })
    .composite([{ input: artwork, left: inset, top: inset }])
    .png()
    .toFile(resolve(root, `public/icon-maskable-${size}.png`));
}
