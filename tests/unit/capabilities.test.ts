// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { probeImageTracking, probeImmersiveXr, probeWebMidi, probeWebXR } from "@/lib/services/capabilities";

describe("progressive capability probes", () => {
  it("reports unavailable WebXR without blocking other experiences", async () => {
    expect((await probeWebXR()).available).toBe(false);
  });
  it("prefers passthrough mixed reality when both immersive modes are exposed", async () => {
    Object.defineProperty(navigator, "xr", {
      configurable: true,
      value: { isSessionSupported: vi.fn(async (mode: XRSessionMode) => mode === "immersive-ar" || mode === "immersive-vr") },
    });
    await expect(probeImmersiveXr()).resolves.toMatchObject({ available: true, immersiveAr: true, immersiveVr: true, preferredMode: "immersive-ar" });
  });
  it("reports camera availability from the standards API", async () => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn() } });
    expect((await probeImageTracking()).available).toBe(true);
  });
  it("keeps MIDI optional", () => {
    expect(probeWebMidi()).toBe(false);
  });
});
