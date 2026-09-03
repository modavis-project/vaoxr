import type { AudioEngine } from "@/lib/services/contracts";
import type { StopManifest } from "@/lib/content";
import { DecodedBufferCache } from "./DecodedBufferCache";
import { getSharedAudioContext } from "./sharedAudioContext";
import { beginAppActivity } from "@/lib/pwa/activity";
import { VoiceLedger } from "./notes";
import { fetchVerifiedVaoBytes } from "@/lib/vao/integrity";
import { prepareVaoForwardLoop, type PreparedVaoLoop } from "./vaoLoop";

type Voice = { source: AudioBufferSourceNode; gain: GainNode; midi: number; stopId: string; startedAt: number };

export class WebAudioEngine implements AudioEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private manifests = new Map<string, StopManifest>();
  private preparedLoops = new Map<string, PreparedVaoLoop>();
  private voices = new Map<string, Voice>();
  private pending = new Map<string, Promise<AudioBuffer | undefined>>();
  private held = new VoiceLedger();
  private cache: DecodedBufferCache;
  private disposed = false;
  private endActivity?: () => void;
  readonly maxVoices = 48;

  constructor(context?: AudioContext, private readonly destination?: AudioNode, cacheBytes = 96 * 1024 * 1024) {
    this.context = context;
    this.cache = new DecodedBufferCache(cacheBytes);
  }

  async unlock() {
    if (this.disposed) throw new Error("Audio engine has been disposed");
    this.context ??= getSharedAudioContext();
    if (!this.master) {
      this.master = this.context.createGain();
      this.master.gain.value = .72;
      this.master.connect(this.destination ?? this.context.destination);
    }
    if (this.context.state !== "running") await this.context.resume();
    this.endActivity ??= beginAppActivity();
  }

  async loadStop(manifest: StopManifest, signal?: AbortSignal) {
    this.manifests.set(manifest.stopId, manifest);
    const centre = manifest.notes.find((note) => note.midi === 60) ?? manifest.notes[0];
    await this.getBuffer(manifest.stopId, centre.midi, signal);
  }

  async preloadNotes(stopId: string, midiNotes: readonly number[], signal?: AbortSignal, concurrency = 6) {
    if (!this.manifests.has(stopId)) throw new Error(`Stop must be loaded before preloading notes: ${stopId}`);
    const queue = [...new Set(midiNotes)];
    const workerCount = Math.max(1, Math.min(Math.floor(concurrency), queue.length));
    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (queue.length) {
        signal?.throwIfAborted();
        const midi = queue.shift();
        if (midi !== undefined) await this.getBuffer(stopId, midi, signal);
      }
    }));
  }

  noteOn(midi: number, stopIds: readonly string[], velocity = 1, normalizationCount = stopIds.length) {
    if (!this.context || !this.master || this.disposed) return;
    const normalizedGain = Math.max(.0001, Math.min(1, velocity)) / Math.sqrt(Math.max(1, normalizationCount));
    for (const stopId of stopIds) {
      const key = this.held.hold(stopId, midi);
      this.releaseVoice(key, .02);
      void this.getBuffer(stopId, midi).then((buffer) => {
        if (!buffer || !this.context || !this.master || this.disposed || !this.held.isHeld(key)) return;
        while (this.voices.size >= this.maxVoices) {
          const oldest = [...this.voices.entries()].sort((a, b) => a[1].startedAt - b[1].startedAt)[0];
          if (!oldest) break; this.releaseVoice(oldest[0], .03);
        }
        const manifest = this.manifests.get(stopId); const note = manifest?.notes.find((item) => item.midi === midi);
        if (!note) return;
        const preparedLoop = this.preparedLoops.get(key);
        if (!preparedLoop) return;
        const source = this.context.createBufferSource(); const gain = this.context.createGain();
        source.buffer = buffer; source.loop = true; source.loopStart = preparedLoop.loopStartSeconds; source.loopEnd = preparedLoop.loopEndSeconds;
        gain.gain.setValueAtTime(0.0001, this.context.currentTime); gain.gain.exponentialRampToValueAtTime(normalizedGain, this.context.currentTime + .012);
        source.connect(gain); gain.connect(this.master); source.start();
        const voice = { source, gain, midi, stopId, startedAt: this.context.currentTime };
        this.voices.set(key, voice); source.addEventListener("ended", () => { if (this.voices.get(key) === voice) this.voices.delete(key); }, { once: true });
      });
    }
  }

  noteOff(midi: number) { this.held.releaseMidi(midi); for (const [key, voice] of this.voices) if (voice.midi === midi) this.releaseVoice(key, .3); }
  releaseStop(stopId: string) { this.held.releaseStop(stopId); for (const [key, voice] of this.voices) if (voice.stopId === stopId) this.releaseVoice(key, .18); }
  rebalanceMidi(midi: number, stopCount: number, velocity = 1) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const target = Math.max(.0001, Math.min(1, velocity)) / Math.sqrt(Math.max(1, stopCount));
    for (const voice of this.voices.values()) {
      if (voice.midi !== midi) continue;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(target, now, .02);
    }
  }
  panic() { this.held.clear(); for (const key of [...this.voices.keys()]) this.releaseVoice(key, .03); }
  setMasterGain(value: number) { if (this.context && this.master) this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), this.context.currentTime, .025); }

  private releaseVoice(key: string, release: number) {
    const voice = this.voices.get(key); if (!voice || !this.context) return;
    const now = this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now); voice.gain.gain.setValueAtTime(Math.max(.0001, voice.gain.gain.value), now); voice.gain.gain.exponentialRampToValueAtTime(.0001, now + release);
    voice.source.stop(now + release + .02); this.voices.delete(key);
  }

  private async getBuffer(stopId: string, midi: number, signal?: AbortSignal) {
    const key = `${stopId}:${midi}`; const cached = this.cache.get(key); if (cached) return cached;
    const existing = this.pending.get(key); if (existing) return existing;
    const request = this.fetchAndDecode(stopId, midi, signal).finally(() => this.pending.delete(key));
    this.pending.set(key, request); return request;
  }

  private async fetchAndDecode(stopId: string, midi: number, signal?: AbortSignal) {
    const key = `${stopId}:${midi}`;
    const note = this.manifests.get(stopId)?.notes.find((item) => item.midi === midi);
    if (!note || !this.context) return undefined;
    const canOpus = document.createElement("audio").canPlayType("audio/ogg; codecs=opus") !== "";
    const realizationId = canOpus ? note.realizations.opus : note.realizations.aac;
    const buffer = await this.context.decodeAudioData(await fetchVerifiedVaoBytes(realizationId, signal));
    this.preparedLoops.set(key, prepareVaoForwardLoop(buffer, note.loop));
    this.cache.set(key, buffer); return buffer;
  }

  dispose() {
    this.disposed = true; this.panic(); this.cache.clear(); this.manifests.clear(); this.preparedLoops.clear(); this.pending.clear();
    this.held.clear(); this.master?.disconnect(); this.master = undefined; this.endActivity?.(); this.endActivity = undefined;
  }
}
