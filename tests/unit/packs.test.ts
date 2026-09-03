// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearPackRecords, deletePackRecord, getPackRecord, putPackRecord } from "@/lib/storage/packDatabase";

describe("offline pack metadata lifecycle", () => {
  beforeEach(() => clearPackRecords());
  it("stores, versions, and removes a device-local pack record", async () => {
    await putPackRecord({ stopId: "ged", version: "1", contentVersion: "audio-1", bytes: 42, codec: "opus", installedAt: 1 });
    expect(await getPackRecord("ged")).toMatchObject({ version: "1", bytes: 42 });
    await deletePackRecord("ged"); expect(await getPackRecord("ged")).toBeUndefined();
  });
});
