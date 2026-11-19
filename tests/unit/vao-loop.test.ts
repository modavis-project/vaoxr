import { describe, expect, it } from "vitest";
import { prepareVaoForwardLoop } from "@/lib/audio/vaoLoop";

function audioBuffer(channels: number[][], sampleRate: number): AudioBuffer {
  const data = channels.map((channel) => Float32Array.from(channel));
  return {
    length: data[0].length,
    duration: data[0].length / sampleRate,
    numberOfChannels: data.length,
    sampleRate,
    getChannelData: (channel: number) => data[channel],
  } as AudioBuffer;
}

describe("VAO forward-loop preparation", () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    it(`keeps a periodic stereo sustain level and its wrap continuous at ${sampleRate} Hz`, () => {
      const channels = [0, .7].map((phase) => Array.from({ length: sampleRate * 6 }, (_, index) =>
        .3 * Math.sin(index / sampleRate * 277.3 * 2 * Math.PI + phase)));
      const buffer = audioBuffer(channels, sampleRate);
      const prepared = prepareVaoForwardLoop(buffer, { startSeconds: 1.5, endSeconds: 5.6, crossfadeSeconds: .08 });
      const tail = prepared.sourceEndFrameExclusive - prepared.crossfadeFrames;
      expect(prepared.loopEndSeconds).toBeGreaterThanOrEqual(5.55);
      expect(prepared.loopEndSeconds).toBeLessThanOrEqual(5.6);
      for (let channel = 0; channel < 2; channel += 1) {
        const samples = buffer.getChannelData(channel);
        const power = samples.slice(tail, prepared.sourceEndFrameExclusive).reduce((sum, value) => sum + value ** 2, 0) / prepared.crossfadeFrames;
        expect(power / (.3 ** 2 / 2)).toBeGreaterThan(.97);
        expect(power / (.3 ** 2 / 2)).toBeLessThan(1.03);
        // The last blended frame and the first repeated frame are adjacent
        // samples of the original head, even after phase alignment.
        const wrap = prepared.sourceStartFrame + prepared.crossfadeFrames;
        expect(samples[prepared.sourceEndFrameExclusive - 1]).toBeCloseTo(channels[channel][wrap - 1], 6);
        expect(samples[wrap]).toBeCloseTo(channels[channel][wrap], 6);
        expect(samples.slice(0, tail)).toEqual(Float32Array.from(channels[channel].slice(0, tail)));
        expect(samples.slice(prepared.sourceEndFrameExclusive)).toEqual(Float32Array.from(channels[channel].slice(prepared.sourceEndFrameExclusive)));
      }
    });
  }

  it("excludes a recorded release before the declared loop end", () => {
    const sampleRate = 48000;
    const values = Array.from({ length: sampleRate * 6 }, (_, index) => {
      const time = index / sampleRate;
      return .3 * Math.sin(time * 343 * 2 * Math.PI) * (time < 4.45 ? 1 : Math.exp(-(time - 4.45) * 30));
    });
    const buffer = audioBuffer([values], sampleRate);
    const prepared = prepareVaoForwardLoop(buffer, { startSeconds: 1.5, endSeconds: 5.6, crossfadeSeconds: .08 });
    expect(prepared.loopEndSeconds).toBeGreaterThan(4.3);
    expect(prepared.loopEndSeconds).toBeLessThan(4.45);
  });

  it("avoids both a phase-cancellation dip and an equal-power gain bump", () => {
    const sampleRate = 48000;
    // The original 4.02-second separation is exactly half a cycle out of phase.
    const frequency = 100.5 / 4.02;
    const values = Array.from({ length: sampleRate * 6 }, (_, index) => .4 * Math.sin(index / sampleRate * frequency * 2 * Math.PI));
    const buffer = audioBuffer([values], sampleRate);
    const prepared = prepareVaoForwardLoop(buffer, { startSeconds: 1.5, endSeconds: 5.6, crossfadeSeconds: .08 });
    const tail = prepared.sourceEndFrameExclusive - prepared.crossfadeFrames;
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < prepared.crossfadeFrames; index += 1) {
      expect(samples[tail + index]).toBeCloseTo(values[tail + index], 3);
    }
  });

  it("honors a zero-crossfade loop and handles silent samples without NaNs", () => {
    const buffer = audioBuffer([Array.from({ length: 4800 }, () => 0)], 4800);
    const prepared = prepareVaoForwardLoop(buffer, { startSeconds: .1, endSeconds: .9, crossfadeSeconds: 0 });
    expect(prepared.loopStartSeconds).toBe(.1);
    expect(prepared.loopEndSeconds).toBe(.9);
    prepareVaoForwardLoop(buffer, { startSeconds: .1, endSeconds: .9, crossfadeSeconds: .08 });
    expect(buffer.getChannelData(0).every((value) => value === 0)).toBe(true);
  });

  it("bakes the declared crossfade into the sustain tail and skips the overlapped head", () => {
    const values = Array.from({ length: 16 }, (_, index) => index);
    const buffer = audioBuffer([values], 10);
    const prepared = prepareVaoForwardLoop(buffer, { startSeconds: 0.2, endSeconds: 1.4, crossfadeSeconds: 0.3 });

    expect(prepared).toEqual({
      loopStartSeconds: 0.5,
      loopEndSeconds: 1.4,
      sourceStartFrame: 2,
      sourceEndFrameExclusive: 14,
      crossfadeFrames: 3,
    });
    expect([...buffer.getChannelData(0).slice(0, 11)]).toEqual(values.slice(0, 11));
    expect(buffer.getChannelData(0)[11]).toBe(11);
    expect(buffer.getChannelData(0)[12]).toBeCloseTo(7.5);
    expect(buffer.getChannelData(0)[13]).toBe(4);
    expect(buffer.getChannelData(0)[14]).toBe(14);
  });

  it("applies the same frame-aligned window independently to every channel", () => {
    const buffer = audioBuffer([
      Array.from({ length: 16 }, (_, index) => index),
      Array.from({ length: 16 }, (_, index) => index * -2),
    ], 10);
    prepareVaoForwardLoop(buffer, { startSeconds: 0.2, endSeconds: 1.4, crossfadeSeconds: 0.3 });
    expect(buffer.getChannelData(1)[12]).toBeCloseTo(-15);
    expect(buffer.getChannelData(1)[13]).toBe(-8);
  });

  it("rejects loop metadata that cannot produce a valid forward sustain", () => {
    const buffer = audioBuffer([Array.from({ length: 16 }, () => 0)], 10);
    expect(() => prepareVaoForwardLoop(buffer, { startSeconds: 0.5, endSeconds: 0.4, crossfadeSeconds: 0.1 })).toThrow(/loop end/i);
    expect(() => prepareVaoForwardLoop(buffer, { startSeconds: 0.2, endSeconds: 1.0, crossfadeSeconds: 0.4 })).toThrow(/shorter than half/i);
  });
});
