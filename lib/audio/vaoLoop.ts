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

// Some recordings release before their declared loop end. Inspect 20 ms RMS
// windows against the early sustain, and leave 60 ms before a persistent 3 dB
// fall. All adjustments stay inside the authored region; the attack is intact.
function findSustainEnd(channels: Float32Array[], start: number, end: number, fade: number, sampleRate: number) {
  const window = Math.max(1, Math.round(sampleRate * .02));
  const referenceWindows = Math.min(25, Math.floor((end - start) / (4 * window)));
  if (referenceWindows < 3) return end;
  const powers: number[] = [];
  for (let frame = start; frame + window <= end; frame += window) {
    let power = 0;
    for (const channel of channels) {
      for (let index = frame; index < frame + window; index += 1) power += channel[index] ** 2;
    }
    powers.push(power / (window * channels.length));
  }
  const reference = powers.slice(0, referenceWindows).sort((a, b) => a - b)[Math.floor(referenceWindows / 2)];
  if (reference < 1e-12) return end;
  const minimumEnd = start + 2 * fade + window;
  for (let index = referenceWindows; index + 1 < powers.length; index += 1) {
    if (powers[index] < reference * .5 && powers[index + 1] < reference * .5) {
      const candidate = start + index * window - Math.round(sampleRate * .06);
      if (candidate >= minimumEnd) return candidate;
    }
  }
  return end;
}

function correlation(channels: Float32Array[], head: number, tail: number, weights: Float32Array, stride = 1) {
  let product = 0; let headPower = 0; let tailPower = 0;
  for (const channel of channels) {
    for (let index = 0; index < weights.length; index += stride) {
      const a = channel[head + index]; const b = channel[tail + index];
      const weight = weights[index];
      product += a * b * weight; headPower += a * a * weight; tailPower += b * b * weight;
    }
  }
  const denominator = Math.sqrt(headPower * tailPower);
  return denominator > 1e-12 ? Math.max(-1, Math.min(1, product / denominator)) : 0;
}

function alignLoopEnd(channels: Float32Array[], start: number, end: number, fade: number, sampleRate: number) {
  // Search every frame in the last 50 ms: this covers several periods even for
  // the lowest pipe. Sample the full overlap sparsely, then score the best eight
  // candidates at full resolution. Both stereo channels use the same offset.
  const search = Math.max(0, Math.min(Math.floor(sampleRate * .05), end - start - 2 * fade - 1));
  const stride = Math.max(1, Math.floor(fade / 512));
  // Emphasize the middle of the fade, where both signals are audible and phase
  // cancellation matters most. The ends contain almost exclusively one signal.
  const weights = Float32Array.from({ length: fade }, (_, index) => fade < 3 ? 1 : Math.sin(Math.PI * index / (fade - 1)) ** 2);
  const candidates: { end: number; score: number }[] = [];
  for (let offset = 0; offset <= search; offset += 1) {
    const candidate = end - offset;
    const score = correlation(channels, start, candidate - fade, weights, stride);
    if (candidates.length === 8 && score <= candidates[7].score) continue;
    candidates.push({ end: candidate, score });
    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length > 8) candidates.pop();
  }
  // Include the unshifted boundary so approximate scoring cannot make it worse.
  let best = { end, score: correlation(channels, start, end - fade, weights) };
  for (const candidate of candidates) {
    const score = correlation(channels, start, candidate.end - fade, weights);
    if (score > best.score) best = { end: candidate.end, score };
  }
  return best;
}

/**
 * Prepare a sustained sample once, after decoding: exclude recorded releases,
 * align the overlap's phase, and bake a correlation-compensated cosine fade.
 * An ordinary constant-sum fade can cancel opposite phases; an equal-power
 * fade alone can boost matching phases. Measured correlation bridges the two.
 *
 * Only the runtime crossfade tail is mutated. Verified VAO bytes and the attack
 * remain intact. A single native AudioBufferSourceNode repeats the prepared
 * region without timers, recurring DSP, extra voices, or cumulative drift.
 * Call once per freshly decoded buffer, before putting it in the audio cache.
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

  let sourceEndFrameExclusive = Math.min(buffer.length, requestedEndFrame);
  const loopFrames = sourceEndFrameExclusive - sourceStartFrame;
  const crossfadeFrames = Math.round(loop.crossfadeSeconds * sampleRate);
  if (crossfadeFrames * 2 >= loopFrames) throw new Error("VAO loop crossfade must be shorter than half the sustain region");

  if (crossfadeFrames > 0) {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
    sourceEndFrameExclusive = findSustainEnd(channels, sourceStartFrame, sourceEndFrameExclusive, crossfadeFrames, sampleRate);
    const aligned = alignLoopEnd(channels, sourceStartFrame, sourceEndFrameExclusive, crossfadeFrames, sampleRate);
    sourceEndFrameExclusive = aligned.end;
    // Never amplify a negative-correlation overlap beyond the equal-power
    // correction (+3 dB). This also keeps noisy or silent inputs well behaved.
    const overlapCorrelation = Math.max(0, aligned.score);
    const tailStartFrame = sourceEndFrameExclusive - crossfadeFrames;
    for (let index = 0; index < crossfadeFrames; index += 1) {
      const position = crossfadeFrames === 1 ? 1 : index / (crossfadeFrames - 1);
      const headGain = 0.5 - 0.5 * Math.cos(Math.PI * position);
      const tailGain = 1 - headGain;
      const compensation = 1 / Math.sqrt(tailGain ** 2 + headGain ** 2 + 2 * overlapCorrelation * tailGain * headGain);
      for (const samples of channels) {
        samples[tailStartFrame + index] = (samples[tailStartFrame + index] * tailGain
          + samples[sourceStartFrame + index] * headGain) * compensation;
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
