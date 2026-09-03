import type { StopManifest } from "@/lib/content";

export type Unsubscribe = () => void;
export type PackState = "absent" | "downloading" | "ready" | "stale" | "error";
export interface PackStatus { stopId: string; state: PackState; completedBytes: number; totalBytes: number; version?: string; error?: string }
export interface PackProgress extends PackStatus { fraction: number }

export interface AudioEngine {
  unlock(): Promise<void>;
  loadStop(manifest: StopManifest, signal?: AbortSignal): Promise<void>;
  noteOn(midi: number, stopIds: readonly string[], velocity?: number, normalizationCount?: number): void;
  noteOff(midi: number): void;
  releaseStop(stopId: string): void;
  panic(): void;
  setMasterGain(value: number): void;
  dispose(): void;
}

export interface MediaPackManager {
  getStatus(stopId: string): Promise<PackStatus>;
  download(manifest: StopManifest): Promise<void>;
  remove(stopId: string): Promise<void>;
  cancel(stopId: string): void;
  estimateStorage(): Promise<{ usage?: number; quota?: number }>;
  clearAll(): Promise<void>;
  onProgress(listener: (progress: PackProgress) => void): Unsubscribe;
}

export type TrackingState = "idle" | "requesting" | "scanning" | "found" | "temporarily-lost" | "denied" | "unavailable" | "error";
export interface TrackingProbe { available: boolean; reason?: string }
export interface ImmersiveXrProbe {
  available: boolean;
  immersiveAr: boolean;
  immersiveVr: boolean;
  preferredMode?: "immersive-ar" | "immersive-vr";
  reason?: string;
}
export interface TrackingAdapter {
  probe(): Promise<TrackingProbe>;
  start(container: HTMLElement): Promise<void>;
  stop(): Promise<void>;
  setScale(scale: number): void;
  onState(listener: (state: TrackingState) => void): Unsubscribe;
  dispose(): Promise<void>;
}

export interface PerformanceSnapshot { currentTime: number; duration: number; playing: boolean; ended: boolean }
export interface PerformanceClock {
  play(): Promise<void>;
  pause(): void;
  restart(): Promise<void>;
  seek(seconds: number): void;
  snapshot(): PerformanceSnapshot;
  subscribe(listener: (snapshot: PerformanceSnapshot) => void): Unsubscribe;
  dispose(): void;
}
