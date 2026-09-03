import { describe, expect, it } from "vitest";
import instrumentJson from "@/content/instrument.json";
import { assertVaoBinding, getVaoRealizationByUrl, getVaoRealizationUrl, vaoRelease } from "@/lib/vao/release";

describe("VAO reader projection", () => {
  it("accepts only the immutable 0.5.0 release", () => {
    expect(vaoRelease.formatVersion).toBe("0.5.0");
    expect(vaoRelease.releaseId).toBe("https://vaoxr.modavis.org/vao/releases/0.5.0-2");
    expect(vaoRelease.profiles).toContain("https://w3id.org/modavis/vao/profile/core/0.5.0");
  });

  it("resolves application media through the preservation carrier map", () => {
    const id = instrumentJson.model.realizationId;
    const url = getVaoRealizationUrl(id);
    expect(url).toBe(instrumentJson.model.url);
    expect(getVaoRealizationByUrl(url).id).toBe(id);
    expect(assertVaoBinding(id, { sha256: instrumentJson.model.sha256 }).mediaType).toBe("model/gltf-binary");
  });

  it("rejects paths and identities outside the release", () => {
    expect(() => getVaoRealizationByUrl("/media/models/organ.glb")).toThrow();
    expect(() => assertVaoBinding(instrumentJson.model.realizationId, { sha256: "0".repeat(64) })).toThrow();
  });
});
