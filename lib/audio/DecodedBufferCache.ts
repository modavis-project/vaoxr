export class DecodedBufferCache {
  private entries = new Map<string, { buffer: AudioBuffer; bytes: number }>();
  private usedBytes = 0;
  constructor(readonly maxBytes = 96 * 1024 * 1024) {}

  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key); this.entries.set(key, entry);
    return entry.buffer;
  }

  set(key: string, buffer: AudioBuffer) {
    const bytes = buffer.length * buffer.numberOfChannels * 4;
    const previous = this.entries.get(key);
    if (previous) { this.usedBytes -= previous.bytes; this.entries.delete(key); }
    while (this.usedBytes + bytes > this.maxBytes && this.entries.size) {
      const oldest = this.entries.keys().next().value as string;
      this.usedBytes -= this.entries.get(oldest)!.bytes; this.entries.delete(oldest);
    }
    if (bytes <= this.maxBytes) { this.entries.set(key, { buffer, bytes }); this.usedBytes += bytes; }
  }

  clear() { this.entries.clear(); this.usedBytes = 0; }
  get sizeBytes() { return this.usedBytes; }
}
