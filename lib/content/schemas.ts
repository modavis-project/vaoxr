import { z } from "zod";

const vector3 = z.tuple([z.number(), z.number(), z.number()]);
const stop = z.object({
  id: z.string().min(1), label: z.string().min(1), packVersion: z.string().min(1),
  manifestUrl: z.string().startsWith("/"), manifestRealizationId: z.string().min(1), defaultSelected: z.boolean(),
});

export const instrumentSchema = z.object({
  schemaVersion: z.literal(1), contentVersion: z.string().min(1), id: z.string().min(1), name: z.string().min(1), maker: z.string(),
  model: z.object({
    url: z.string().startsWith("/"), realizationId: z.string().min(1), sha256: z.string(), physicalWidthMetres: z.number().positive(), markerWidthMetres: z.number().positive(),
    physicalCalibration: z.object({
      sourceUnitMetres: z.number().positive(), status: z.literal("inferred"), method: z.string().min(1), reference: z.string().url(),
      closedCaseDimensionsMetres: z.object({ height: z.number().positive(), width: z.number().positive(), depth: z.number().positive() }),
      openModelBoundsMetres: z.object({ minimum: vector3, maximum: vector3 }), note: z.string().min(1),
    }),
    display: z.object({ position: vector3, rotation: vector3, scale: z.number().positive() }),
  }),
  performance: z.object({
    id: z.string(), label: z.string(), audioUrl: z.string().startsWith("/"), audioRealizationId: z.string().min(1), durationSeconds: z.number().positive(),
    animationDurationSeconds: z.number().positive(), timelineUrl: z.string().startsWith("/"), timelineRealizationId: z.string().min(1),
    sync: z.object({
      mode: z.literal("native-time-clamp"),
      audioTimeAtAnimationStartSeconds: z.number().nonnegative(),
      measuredAudibleStartSeconds: z.number().nonnegative(),
      measuredAudibleEndSeconds: z.number().positive(),
      measuredTrailingSilenceSeconds: z.number().nonnegative(),
      measurement: z.string().min(1),
    }),
  }),
  notes: z.array(z.number().int().min(0).max(127)).length(45),
  stops: z.array(stop).length(5),
  licence: z.object({ status: z.string(), attribution: z.string() }),
});

export const buildingSchema = z.object({
  schemaVersion: z.literal(1), contentVersion: z.string(), id: z.string(), name: z.string(), floorPlanUrl: z.string().startsWith("/"), floorPlanRealizationId: z.string().min(1),
  points: z.array(z.object({
    id: z.string(), label: z.string(), shortLabel: z.string(), description: z.string(),
    position: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
    audio: z.object({ mp3: z.string().startsWith("/"), realizationId: z.string().min(1) }),
  })).length(4),
});

const noteAssetSchema = z.object({
  midi: z.number().int().min(0).max(127), opusUrl: z.string(), aacUrl: z.string(), bytes: z.object({ opus: z.number().int().nonnegative(), aac: z.number().int().nonnegative() }),
  checksum: z.object({ source: z.string(), opus: z.string(), aac: z.string() }), realizations: z.object({ opus: z.string().min(1), aac: z.string().min(1) }), sampleRate: z.literal(48000), durationSeconds: z.number().positive(), loop: z.object({ startSeconds: z.number().nonnegative(), endSeconds: z.number().positive(), crossfadeSeconds: z.number().positive() }),
});

export const stopManifestSchema = z.object({
  schemaVersion: z.literal(1), contentVersion: z.string(), stopId: z.string(), label: z.string(), packVersion: z.string(), codecs: z.array(z.string()).length(2), totalBytes: z.object({ opus: z.number(), aac: z.number() }), notes: z.array(noteAssetSchema).length(45),
});

export const performanceTimelineSchema = z.object({
  schemaVersion: z.literal(1), contentVersion: z.string(), id: z.string(), source: z.string(),
  sourceDurationSeconds: z.number().positive(), audioDurationSeconds: z.number().positive(),
  mapping: z.object({
    mode: z.literal("native-time-clamp"), audioTimeAtAnimationStartSeconds: z.number().nonnegative(),
    measuredAudibleStartSeconds: z.number().nonnegative(), measuredAudibleEndSeconds: z.number().positive(),
    measuredTrailingSilenceSeconds: z.number().nonnegative(), measurement: z.string().min(1),
  }),
  tracks: z.array(z.object({
    node: z.string().regex(/^(M1\.|REG\.)/), property: z.literal("rotationEulerDeltaDegrees"), interpolation: z.literal("linear"),
    baseSourceEuler: z.tuple([z.number(), z.number(), z.number()]),
    keys: z.array(z.tuple([z.number().nonnegative(), z.number(), z.number(), z.number()])).min(1),
  })),
});

export type InstrumentManifest = z.infer<typeof instrumentSchema>;
export type BuildingManifest = z.infer<typeof buildingSchema>;
export type StopManifest = z.infer<typeof stopManifestSchema>;
export type PerformanceTimeline = z.infer<typeof performanceTimelineSchema>;
