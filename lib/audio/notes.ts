export const organNotes = [36, 38, 40, 41, 43, ...Array.from({ length: 40 }, (_, index) => index + 45)] as const;
const computerKeyCodes = [
  "KeyZ", "KeyS", "KeyX", "KeyD", "KeyC", "KeyV", "KeyG", "KeyB", "KeyH", "KeyN", "KeyJ", "KeyM", "Comma", "KeyL", "Period", "Semicolon", "Slash",
  "KeyQ", "Digit2", "KeyW", "Digit3", "KeyE", "KeyR", "Digit5", "KeyT", "Digit6", "KeyY", "Digit7", "KeyU", "KeyI", "Digit9", "KeyO", "Digit0", "KeyP", "BracketLeft", "Equal", "BracketRight",
] as const;
export const computerKeyMap = new Map<string, number>(computerKeyCodes.map((code, index) => [code, organNotes[index]]));

export class VoiceLedger {
  private held = new Set<string>();
  hold(stopId: string, midi: number) { const key = `${stopId}:${midi}`; this.held.add(key); return key; }
  isHeld(key: string) { return this.held.has(key); }
  releaseMidi(midi: number) { for (const key of [...this.held]) if (key.endsWith(`:${midi}`)) this.held.delete(key); }
  releaseStop(stopId: string) { for (const key of [...this.held]) if (key.startsWith(`${stopId}:`)) this.held.delete(key); }
  clear() { this.held.clear(); }
  get size() { return this.held.size; }
}
