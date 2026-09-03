import { describe, expect, it } from "vitest";
import instrumentJson from "@/content/instrument.json";
import buildingJson from "@/content/building.json";
import { buildingSchema, instrumentSchema, performanceTimelineSchema, stopManifestSchema } from "@/lib/content/schemas";
import timelineJson from "@/public/vao/releases/0.5.0-2/workspace/payload/media/performance/pachelbel.json";
import gedacktJson from "@/public/vao/releases/0.5.0-2/workspace/payload/media/audio/stops/ged/manifest.json";

describe("versioned content manifests", () => {
  it("accepts the instrument and building contracts", () => {
    expect(instrumentSchema.parse(instrumentJson).notes).toHaveLength(45);
    expect(buildingSchema.parse(buildingJson).points).toHaveLength(4);
  });
  it("accepts generated performance and stop contracts", () => {
    expect(performanceTimelineSchema.parse(timelineJson).tracks).toHaveLength(34);
    expect(stopManifestSchema.parse(gedacktJson).notes).toHaveLength(45);
  });
  it("rejects an unsafe normalized room position", () => {
    const invalid = structuredClone(buildingJson); invalid.points[0].position.x = 2;
    expect(() => buildingSchema.parse(invalid)).toThrow();
  });
});
