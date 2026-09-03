import type { PerformanceClock, PerformanceSnapshot, Unsubscribe } from "@/lib/services/contracts";
import { beginAppActivity } from "@/lib/pwa/activity";
import { fetchVerifiedVaoBytes } from "@/lib/vao/integrity";
import { getVaoRealization } from "@/lib/vao/release";

export class MediaPerformanceClock implements PerformanceClock {
  private readonly audio: HTMLAudioElement;
  private readonly listeners = new Set<(snapshot: PerformanceSnapshot) => void>();
  private frame = 0;
  private disposed = false;
  private endActivity?: () => void;
  private objectUrl?: string;
  private preparePromise?: Promise<void>;

  constructor(private readonly realizationId: string, private readonly declaredDuration: number) {
    this.audio = new Audio(); this.audio.preload = "metadata";
    this.audio.addEventListener("play", this.startTicks);
    this.audio.addEventListener("pause", this.notify);
    this.audio.addEventListener("ended", this.notify);
    this.audio.addEventListener("durationchange", this.notify);
  }

  async play() { if (!this.disposed) { await this.prepare(); await this.audio.play(); this.endActivity ??= beginAppActivity(); } }
  pause() { this.audio.pause(); this.endActivity?.(); this.endActivity = undefined; }
  async restart() { this.audio.currentTime = 0; await this.play(); }
  seek(seconds: number) { this.audio.currentTime = Math.max(0, Math.min(this.duration, seconds)); this.notify(); }
  snapshot(): PerformanceSnapshot { return { currentTime: this.audio.currentTime || 0, duration: this.duration, playing: !this.audio.paused && !this.audio.ended, ended: this.audio.ended }; }
  subscribe(listener: (snapshot: PerformanceSnapshot) => void): Unsubscribe { this.listeners.add(listener); listener(this.snapshot()); return () => this.listeners.delete(listener); }
  private get duration() { return Number.isFinite(this.audio.duration) ? this.audio.duration : this.declaredDuration; }
  private async prepare() {
    if (this.objectUrl) return;
    this.preparePromise ??= fetchVerifiedVaoBytes(this.realizationId).then((bytes) => {
      if (this.disposed) return;
      const realization = getVaoRealization(this.realizationId);
      this.objectUrl = URL.createObjectURL(new Blob([bytes], { type: realization.mediaType }));
      this.audio.src = this.objectUrl;
      this.audio.load();
    });
    await this.preparePromise;
  }
  private notify = () => { const snapshot = this.snapshot(); if (snapshot.ended) { this.endActivity?.(); this.endActivity = undefined; } for (const listener of this.listeners) listener(snapshot); };
  private startTicks = () => { cancelAnimationFrame(this.frame); const tick = () => { if (this.disposed) return; this.notify(); if (!this.audio.paused && !this.audio.ended) this.frame = requestAnimationFrame(tick); }; tick(); };
  dispose() { this.disposed = true; cancelAnimationFrame(this.frame); this.audio.pause(); this.endActivity?.(); this.endActivity = undefined; this.audio.removeEventListener("play", this.startTicks); this.audio.removeEventListener("pause", this.notify); this.audio.removeEventListener("ended", this.notify); this.audio.removeEventListener("durationchange", this.notify); this.audio.removeAttribute("src"); this.audio.load(); if (this.objectUrl) URL.revokeObjectURL(this.objectUrl); this.objectUrl = undefined; this.listeners.clear(); }
}
