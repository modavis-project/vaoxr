import { describe, expect, it } from "vitest";
import { DecodedBufferCache } from "@/lib/audio/DecodedBufferCache";
import { computerKeyMap, organNotes, VoiceLedger } from "@/lib/audio/notes";

const buffer = (length: number, channels = 2) => ({ length, numberOfChannels: channels }) as AudioBuffer;

describe("playable organ primitives", () => {
  it("maps exactly the archival 45-note range", () => {
    expect(organNotes).toHaveLength(45);
    expect(organNotes.slice(0, 6)).toEqual([36, 38, 40, 41, 43, 45]);
    expect(organNotes.at(-1)).toBe(84);
    expect(computerKeyMap.get("KeyZ")).toBe(36);
  });
  it("evicts least-recently-used decoded buffers under the byte cap", () => {
    const cache = new DecodedBufferCache(64);
    cache.set("a", buffer(4)); cache.set("b", buffer(4)); cache.get("a"); cache.set("c", buffer(4));
    expect(cache.get("a")).toBeDefined(); expect(cache.get("b")).toBeUndefined(); expect(cache.get("c")).toBeDefined(); expect(cache.sizeBytes).toBe(64);
  });
  it("tracks held voices and releases by MIDI note or stop", () => {
    const ledger = new VoiceLedger(); const ged = ledger.hold("ged", 60); const regal = ledger.hold("reg8", 60); ledger.hold("ged", 64);
    expect(ledger.isHeld(ged)).toBe(true); ledger.releaseMidi(60); expect(ledger.isHeld(ged)).toBe(false); expect(ledger.isHeld(regal)).toBe(false); expect(ledger.size).toBe(1);
    ledger.hold("reg8", 67); ledger.releaseStop("ged"); expect(ledger.size).toBe(1); ledger.clear(); expect(ledger.size).toBe(0);
  });
});
