import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import releaseIndex from "@/content/vao-index.json";
import manifest from "@/public/vao/releases/0.5.0-2/vao-manifest.json";
import carrier from "@/public/vao/releases/0.5.0-2/workspace/META-INF/vao-carrier.json";
import releaseDescriptor from "@/public/vao/releases/0.5.0-2/vao-release.json";

const root = resolve(import.meta.dirname, "../..");
const workspace = resolve(root, "public/vao/releases/0.5.0-2/workspace");
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("VAO 0.5.0 publication", () => {
  it("pins the canonical manifest identically at every carrier boundary", async () => {
    const publicBytes = await readFile(resolve(root, "public/vao/releases/0.5.0-2/vao-manifest.json"));
    const workspaceBytes = await readFile(resolve(workspace, "vao-manifest.json"));
    expect(publicBytes.equals(workspaceBytes)).toBe(true);
    expect(digest(publicBytes)).toBe(carrier.manifestSHA256);
    expect(publicBytes.byteLength).toBe(carrier.manifestByteSize);
    expect(releaseIndex.manifest.sha256).toBe(carrier.manifestSHA256);
    expect(manifest.formatVersion).toBe("0.5.0");
    expect(manifest.conformsTo).toContain("https://w3id.org/modavis/vao/profile/dynamic-delivery/0.5.0");
  });

  it("maps every payload member once and verifies its exact bytes", async () => {
    expect(carrier.carrierMode).toBe("preservation-closure");
    expect(carrier.embeddedRealizations).toHaveLength(manifest.realizations.length);
    const mappings = new Map(carrier.embeddedRealizations.map((entry) => [entry.realizationId, entry.path]));
    for (const realization of manifest.realizations) {
      const path = mappings.get(realization.id);
      expect(path).toMatch(/^payload\//);
      const bytes = await readFile(resolve(workspace, path!));
      expect(bytes.byteLength).toBe(realization.byteSize);
      expect(digest(bytes)).toBe(realization.sha256);
    }
  }, 30_000);

  it("inventories the bootstrap and preservation carriers in one release", async () => {
    const files = releaseDescriptor.publication.rootRecord.files;
    expect(files.filter((file) => file.role === "carrier")).toHaveLength(2);
    expect(files.find((file) => file.carrierMode === "bootstrap")).toBeTruthy();
    expect(files.find((file) => file.carrierMode === "preservation-closure")).toBeTruthy();
    for (const file of files.filter((entry) => entry.role === "carrier")) {
      expect((await stat(resolve(root, `public/vao/releases/0.5.0-2/${file.fileIdentifier}`))).size).toBe(file.byteSize);
    }
  });

  it("preserves sourced physical calibration without conflating closed and open dimensions", () => {
    expect(manifest.release.revision).toBe(2);
    expect(manifest.release.supersedesReleaseId).toBe("https://vaoxr.modavis.org/vao/releases/0.5.0-1");
    const observations = new Map(manifest.scientific.observations.map((observation) => [observation.id, observation]));
    expect(observations.get("urn:vaoxr:observation:closed-case-width")?.result.value).toBe(1.17);
    expect(observations.get("urn:vaoxr:observation:model-source-unit-length")?.result.value).toBe(0.223);
    expect(observations.get("urn:vaoxr:observation:model-source-unit-length")?.status).toBe("inferred");
    expect(manifest.acoustics.coordinateFrames.find((frame) => frame.id === "urn:vaoxr:frame:organ-model")?.unit).toBe("http://qudt.org/vocab/unit/UNITLESS");
  });

  it("maps every model key and stop segment to a portable interaction control", () => {
    expect(manifest.interactionModel.controls).toHaveLength(50);
    for (const [index, stopId] of ["ged", "princ4", "princ2", "qui223", "reg8"].entries()) {
      const control = manifest.interactionModel.controls.find((entry) => entry.id === `urn:vaoxr:control:stop:${stopId}`);
      expect(control?.sourceLocator).toBe(`REG.${index + 1}`);
      expect(control?.entityId).toBe(`urn:vaoxr:entity:cuntz-positive-organ:stop:${stopId}`);
    }
  });
});
