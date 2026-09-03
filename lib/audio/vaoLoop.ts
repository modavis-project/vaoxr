interface VaoLoopMetadata {
  startSeconds: number;
  endSeconds: number;
  crossfadeSeconds: number;
}

export interface PreparedVaoLoop {
  loopStartSeconds: number;
  loopEndSeconds: number;
  sourceStartFrame: number;
  sourceEndFrameExclusive: number;
  crossfadeFrames: number;
}

/**
 * Bakes a forward-loop overlap into the decoded PCM buffer once, then returns
 * frame-aligned native Web Audio loop points. The head of the sustain region
 * is mixed over its tail with a raised-cosine window. Playback wraps to the
 * first frame after that overlapped head, so it is not heard twice.
 *
 * This mutates only the crossfade tail of the decoded runtime buffer. The
 * verified VAO realization bytes, attack, and the rest of the sustain are not
 * changed. Keeping the overlap in the buffer lets every voice use one native
 * AudioBufferSourceNode without main-thread scheduling or recurring DSP.
 */
export function prepareVaoForwardLoop(buffer: AudioBuffer, loop: VaoLoopMetadata): PreparedVaoLoop {
  if (!Number.isFinite(buffer.sampleRate) || buffer.sampleRate <= 0 || buffer.length < 2) throw new Error("Invalid decoded VAO sample buffer");
  if (!Number.isFinite(loop.startSeconds) || !Number.isFinite(loop.endSeconds) || !Number.isFinite(loop.crossfadeSeconds)) throw new Error("Invalid VAO loop metadata");

  const sampleRate = buffer.sampleRate;
  const sourceStartFrame = Math.round(loop.startSeconds * sampleRate);
  const requestedEndFrame = Math.round(loop.endSeconds * sampleRate);
  const endToleranceFrames = 1;
  if (sourceStartFrame < 0 || sourceStartFrame >= buffer.length) throw new Error("VAO loop start lies outside the decoded sample");
  if (requestedEndFrame <= sourceStartFrame || requestedEndFrame > buffer.length + endToleranceFrames) throw new Error("VAO loop end lies outside the decoded sample");
  if (loop.crossfadeSeconds < 0) throw new Error("VAO loop crossfade cannot be negative");

  const sourceEndFrameExclusive = Math.min(buffer.length, requestedEndFrame);
  const loopFrames = sourceEndFrameExclusive - sourceStartFrame;
  const crossfadeFrames = Math.round(loop.crossfadeSeconds * sampleRate);
  if (crossfadeFrames * 2 >= loopFrames) throw new Error("VAO loop crossfade must be shorter than half the sustain region");

  if (crossfadeFrames > 0) {
    const tailStartFrame = sourceEndFrameExclusive - crossfadeFrames;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const samples = buffer.getChannelData(channel);
      for (let index = 0; index < crossfadeFrames; index += 1) {
        const position = crossfadeFrames === 1 ? 0.5 : index / (crossfadeFrames - 1);
        const headGain = 0.5 - 0.5 * Math.cos(Math.PI * position);
        const tailGain = 1 - headGain;
        samples[tailStartFrame + index] = samples[tailStartFrame + index] * tailGain
          + samples[sourceStartFrame + index] * headGain;
      }
    }
  }

  return {
    loopStartSeconds: (sourceStartFrame + crossfadeFrames) / sampleRate,
    loopEndSeconds: sourceEndFrameExclusive / sampleRate,
    sourceStartFrame,
    sourceEndFrameExclusive,
    crossfadeFrames,
  };
}
