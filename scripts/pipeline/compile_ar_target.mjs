import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CompilerBase } from "mind-ar/src/image-target/compiler-base.js";
import { buildTrackingImageList } from "mind-ar/src/image-target/image-list.js";
import { extractTrackingFeatures } from "mind-ar/src/image-target/tracker/extract-utils.js";
import "mind-ar/src/image-target/detector/kernels/cpu/index.js";

class LocalCompiler extends CompilerBase {
  createProcessCanvas(image) { return createCanvas(image.width, image.height); }
  compileTrack({ progressCallback, targetImages, basePercent }) {
    const list = []; let percent = 0;
    for (const targetImage of targetImages) {
      const images = buildTrackingImageList(targetImage);
      const step = (100 - basePercent) / targetImages.length / images.length;
      list.push(extractTrackingFeatures(images, () => { percent += step; progressCallback(basePercent + percent); }));
    }
    return Promise.resolve(list);
  }
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, "../..");
const mediaRoot = resolve(process.env.POSITIVXR_MEDIA_OUTPUT || join(repoRoot, "work/asset-pipeline/media"));
const marker = join(mediaRoot, "ar/ar-marker.jpg");
const output = join(mediaRoot, "ar/ar-marker.mind");
const image = await loadImage(marker);
const compiler = new LocalCompiler();
await compiler.compileImageTargets([image], () => undefined);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, compiler.exportData());
console.log(`Compiled ${image.width}×${image.height} marker to ${output}`);
