import { describe, expect, it } from "vitest";
import { applyAxisDeadzone, selectSustainableFrameRate } from "@/lib/ar/webXrPolicy";

describe("WebXR headset policy", () => {
  it("selects the lowest supported comfortable headset rate", () => {
    expect(selectSustainableFrameRate(new Float32Array([90, 120, 72]))).toBe(72);
    expect(selectSustainableFrameRate([60])).toBe(60);
    expect(selectSustainableFrameRate()).toBeUndefined();
  });

  it("filters controller drift but preserves intentional thumbstick input", () => {
    expect(applyAxisDeadzone(0.1)).toBe(0);
    expect(applyAxisDeadzone(-0.1)).toBe(0);
    expect(applyAxisDeadzone(0.6)).toBeGreaterThan(0);
    expect(applyAxisDeadzone(-0.6)).toBeLessThan(0);
  });
});
