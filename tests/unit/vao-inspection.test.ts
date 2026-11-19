import { readFileSync } from "node:fs";
import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { inspectVao } from "@/lib/vao/inspection";

function fixture(name: string) {
  return new Uint8Array(readFileSync(new URL("../fixtures/vao/" + name, import.meta.url)));
}

describe("local VAO inspection", () => {
  it.each(["0.5.0", "0.6.0"])("reads a generic VAO %s carrier and its standalone manifest", async (version) => {
    const name = "minimal-" + version + ".vao";
    const bytes = fixture(name);
    const carrier = await inspectVao(new File([bytes], name));
    expect(carrier.manifest.formatVersion).toBe(version);
    expect(carrier.carrier?.carrierMode).toBe(version === "0.5.0" ? "bootstrap" : "preservation-closure");
    expect(carrier.manifest.profiles).toContainEqual({
      id: "https://w3id.org/modavis/vao/profile/core/" + version, version,
    });
    const manifest = await inspectVao(new File([unzipSync(bytes)["vao-manifest.json"]], "vao-manifest.json"));
    expect(manifest.manifest).toEqual(carrier.manifest);
    expect(manifest.carrier).toBeUndefined();
    expect(manifest.audio).toBeUndefined();
  });

  it("shows the independent MMIC profile version and reads checked WAV bytes", async () => {
    const name = "mmic-1.0.0-roll.vao";
    const inspection = await inspectVao(new File([fixture(name)], name));
    expect(inspection.manifest.title.en).toBe("Synthetic MMIC roll");
    expect(inspection.manifest.materializableProfiles).toContainEqual({
      id: "https://w3id.org/modavis/vao/profile/mmic/1.0.0", version: "0.6.0", specificationVersion: "1.0.0",
    });
    expect(inspection.audio?.type).toBe("audio/wav");
    expect(new TextDecoder().decode((await inspection.audio!.arrayBuffer()).slice(0, 4))).toBe("RIFF");
  });

  it("rejects a replaced manifest and corrupted embedded audio", async () => {
    const name = "mmic-1.0.0-roll.vao";
    const members = unzipSync(fixture(name));
    const wav = Object.keys(members).find((path) => path.endsWith(".wav"))!;
    members[wav][members[wav].length - 1] ^= 1;
    await expect(inspectVao(new File([zipSync({ ...members, mimetype: [members.mimetype, { level: 0 }] })], name))).rejects.toThrow(/embedded audio.*SHA-256/);
    members["vao-manifest.json"][0] ^= 1;
    await expect(inspectVao(new File([zipSync({ ...members, mimetype: [members.mimetype, { level: 0 }] })], name))).rejects.toThrow(/carrier manifest.*SHA-256/);
  });

  it("checks the carrier release ID even when the manifest hash agrees", async () => {
    const name = "minimal-0.6.0.vao";
    const members = unzipSync(fixture(name));
    const path = "META-INF/vao-carrier.json";
    const carrier = JSON.parse(new TextDecoder().decode(members[path]));
    carrier.releaseId = "urn:uuid:00000000-0000-0000-0000-000000000001";
    members[path] = strToU8(JSON.stringify(carrier));
    const bytes = zipSync({ ...members, mimetype: [members.mimetype, { level: 0 }] });
    await expect(inspectVao(new File([bytes], name))).rejects.toThrow(/different releases/);
  });

  it("rejects oversized input and mismatched profile metadata", async () => {
    await expect(inspectVao(new File([new Uint8Array(4 * 1024 * 1024 + 1)], "oversized.json")))
      .rejects.toThrow(/4 MiB/);
    const manifest = new TextDecoder().decode(unzipSync(fixture("minimal-0.6.0.vao"))["vao-manifest.json"]);
    await expect(inspectVao(new File([manifest.replace("/profile/core/0.6.0", "/profile/core/0.5.0")], "manifest.json")))
      .rejects.toThrow(/versions disagree/);
  });
});
