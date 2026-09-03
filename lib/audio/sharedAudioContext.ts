let sharedContext: AudioContext | undefined;

export function getSharedAudioContext() {
  sharedContext ??= new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
  return sharedContext;
}
