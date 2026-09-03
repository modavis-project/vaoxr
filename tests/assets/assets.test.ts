import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import instrumentJson from "@/content/instrument.json";
import arReport from "@/public/media/reports/organ-ar.json";
import timeline from "@/public/vao/releases/0.5.0-2/workspace/payload/media/performance/pachelbel.json";
import exportReport from "@/public/vao/releases/0.5.0-2/workspace/payload/media/reports/organ-export.json";

const root = resolve(import.meta.dirname, "../..");
const modelPath = resolve(root, "public/vao/releases/0.5.0-2/workspace/payload/media/models/organ.glb");
const arModelPath = resolve(root, "public/media/models/organ-ar.glb");
const arUsdzPath = resolve(root, "public/media/models/organ-ar.usdz");
const stopIds = ["ged", "princ4", "princ2", "qui223", "reg8"];

const readGlbJson = (data: Buffer) => {
  expect(data.subarray(0, 4).toString()).toBe("glTF");
  const jsonLength = data.readUInt32LE(12);
  expect(data.subarray(16, 20).toString()).toBe("JSON");
  return JSON.parse(data.subarray(20, 20 + jsonLength).toString("utf8"));
};

describe("generated delivery assets", () => {
  it("ships a loadable GLB within the 15 MiB transfer budget", async () => {
    const data = await readFile(modelPath); expect(data.subarray(0, 4).toString()).toBe("glTF"); expect(data.byteLength).toBeLessThanOrEqual(15 * 1024 * 1024);
    expect(createHash("sha256").update(data).digest("hex")).toBe(instrumentJson.model.sha256);
  });
  it("preserves all performance target node names", () => {
    const names = exportReport.animatedNodeNamesPreserved;
    for (const midi of instrumentJson.notes) expect(names).toContain(`M1.${midi}`);
    for (let stop = 1; stop <= 5; stop += 1) expect(names).toContain(`REG.${stop}`);
  });
  it("ships a floor-aligned AR derivative with canonical provenance", async () => {
    const canonical = await readFile(modelPath);
    const derivative = await readFile(arModelPath);
    expect(arReport.source.sha256).toBe(createHash("sha256").update(canonical).digest("hex"));
    expect(arReport.derivative.sha256).toBe(createHash("sha256").update(derivative).digest("hex"));
    expect(arReport.derivative.byteLength).toBe(derivative.byteLength);
    expect(derivative.byteLength).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(arReport.derivative.floorAligned).toBe(true);
    expect(arReport.derivative.physicalWidthMetres).toBe(instrumentJson.model.physicalWidthMetres);
    expect(instrumentJson.model.physicalCalibration.closedCaseDimensionsMetres.width).toBe(1.17);
    expect(instrumentJson.model.physicalCalibration.sourceUnitMetres).toBe(0.223);
    expect(instrumentJson.model.physicalWidthMetres).toBeGreaterThan(instrumentJson.model.physicalCalibration.closedCaseDimensionsMetres.width);
    expect(arReport.derivative.boundsMetres.min[1]).toBe(0);
    const deliveryDocument = readGlbJson(derivative);
    const deliveryNodeNames = deliveryDocument.nodes.map((node: { name?: string }) => node.name);
    for (const midi of instrumentJson.notes) expect(deliveryNodeNames).toContain(`M1.${midi}`);
  });
  it("bakes the Unity performance into portable glTF and animated USDZ delivery assets", async () => {
    const glb = await readFile(arModelPath);
    const document = readGlbJson(glb);
    expect(document.animations).toHaveLength(1);
    expect(document.animations[0].name).toBe("Pachelbel performance");
    expect(document.animations[0].channels).toHaveLength(timeline.tracks.length);
    const targetNames = document.animations[0].channels.map((channel: { target: { node: number } }) => document.nodes[channel.target.node].name);
    expect(targetNames.sort()).toEqual(timeline.tracks.map((track) => track.node).sort());
    expect(document.images.every((image: { mimeType?: string }) => image.mimeType === "image/jpeg")).toBe(true);
    expect(document.extensionsUsed).not.toContain("EXT_texture_webp");
    expect(arReport.derivative.animation.trackCount).toBe(timeline.tracks.length);
    expect(arReport.derivative.animation.durationSeconds).toBe(timeline.sourceDurationSeconds);
    expect(arReport.derivative.animation.audioDurationSeconds).toBe(timeline.audioDurationSeconds);
    expect(arReport.derivative.animation.mapping).toBe("native-time-clamp");

    const usdz = await readFile(arUsdzPath);
    expect(usdz.subarray(0, 2).toString()).toBe("PK");
    expect(usdz.byteLength).toBeLessThanOrEqual(12 * 1024 * 1024);
    expect(arReport.iosDerivative.sha256).toBe(createHash("sha256").update(usdz).digest("hex"));
    expect(arReport.iosDerivative.animation.trackCount).toBe(timeline.tracks.length);
  });
  it("publishes an installable manifest with safe maskable icons and AR shortcuts", async () => {
    const manifest = JSON.parse(await readFile(resolve(root, "public/manifest.webmanifest"), "utf8"));
    expect(manifest.id).toBe("/");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.some((icon: { purpose?: string; sizes?: string }) => icon.purpose === "maskable" && icon.sizes === "512x512")).toBe(true);
    expect(manifest.shortcuts.map((shortcut: { url: string }) => shortcut.url)).toEqual(expect.arrayContaining(["/ar", "/ar/quest", "/play"]));
    await Promise.all(manifest.icons.map(async (icon: { src: string }) => expect((await stat(resolve(root, `public${icon.src}`))).size).toBeGreaterThan(0)));
  });
  it("maps five stops to 225 files in both codecs with valid loop metadata", async () => {
    let count = 0;
    for (const stopId of stopIds) {
      const manifest = JSON.parse(await readFile(resolve(root, `public/vao/releases/0.5.0-2/workspace/payload/media/audio/stops/${stopId}/manifest.json`), "utf8"));
      expect(manifest.notes).toHaveLength(45); count += manifest.notes.length;
      for (const note of manifest.notes) {
        expect(note.loop.startSeconds).toBeLessThan(note.loop.endSeconds);
        expect(note.checksum.opus).toMatch(/^[a-f0-9]{64}$/); expect(note.checksum.aac).toMatch(/^[a-f0-9]{64}$/);
        expect((await stat(resolve(root, `public${note.opusUrl}`))).size).toBe(note.bytes.opus);
        expect((await stat(resolve(root, `public${note.aacUrl}`))).size).toBe(note.bytes.aac);
      }
    }
    expect(count).toBe(225);
  });
});
