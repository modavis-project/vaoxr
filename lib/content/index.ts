import instrumentJson from "@/content/instrument.json";
import buildingJson from "@/content/building.json";
import { buildingSchema, instrumentSchema } from "./schemas";
import { assertVaoBinding, getVaoRealizationUrl } from "@/lib/vao/release";

const instrumentSource = instrumentSchema.parse(instrumentJson);
const modelRealization = assertVaoBinding(instrumentSource.model.realizationId, { sha256: instrumentSource.model.sha256 });
export const instrument = instrumentSchema.parse({
  ...instrumentSource,
  model: { ...instrumentSource.model, url: getVaoRealizationUrl(instrumentSource.model.realizationId), sha256: modelRealization.sha256 },
  performance: {
    ...instrumentSource.performance,
    audioUrl: getVaoRealizationUrl(instrumentSource.performance.audioRealizationId),
    timelineUrl: getVaoRealizationUrl(instrumentSource.performance.timelineRealizationId),
  },
  stops: instrumentSource.stops.map((stop) => ({ ...stop, manifestUrl: getVaoRealizationUrl(stop.manifestRealizationId) })),
});

const buildingSource = buildingSchema.parse(buildingJson);
export const building = buildingSchema.parse({
  ...buildingSource,
  floorPlanUrl: getVaoRealizationUrl(buildingSource.floorPlanRealizationId),
  points: buildingSource.points.map((point) => ({ ...point, audio: { ...point.audio, mp3: getVaoRealizationUrl(point.audio.realizationId) } })),
});
export type { InstrumentManifest, BuildingManifest, StopManifest, PerformanceTimeline } from "./schemas";
