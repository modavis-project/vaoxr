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
