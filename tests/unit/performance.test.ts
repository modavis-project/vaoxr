import { describe, expect, it } from "vitest";
import { mapAudioToAnimationTime } from "@/lib/three/OrganPerformanceBinding";

describe("performance time mapping", () => {
  it("keeps the Unity timeline on native time and clamps the audio tail", () => {
    expect(mapAudioToAnimationTime(17.28, 30)).toBeCloseTo(17.28);
    expect(mapAudioToAnimationTime(34.56, 30)).toBe(30);
  });
  it("clamps seeking outside the performance", () => {
    expect(mapAudioToAnimationTime(-2, 30)).toBe(0);
    expect(mapAudioToAnimationTime(99, 30)).toBe(30);
  });
  it("supports an explicit future delivery offset without stretching time", () => {
    expect(mapAudioToAnimationTime(2.25, 30, 0.25)).toBe(2);
  });
});
