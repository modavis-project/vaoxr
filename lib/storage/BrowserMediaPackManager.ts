import type { StopManifest } from "@/lib/content";
import type { MediaPackManager, PackProgress, PackStatus, Unsubscribe } from "@/lib/services/contracts";
import { clearPackRecords, deletePackRecord, getPackRecord, putPackRecord } from "./packDatabase";
import { fetchVerifiedVaoResponse } from "@/lib/vao/integrity";

const cacheName = "positivxr-stop-packs-v1";

export class BrowserMediaPackManager implements MediaPackManager {
  private readonly listeners = new Set<(progress: PackProgress) => void>();
  private readonly controllers = new Map<string, AbortController>();

  async getStatus(stopId: string): Promise<PackStatus> {
    if (this.controllers.has(stopId)) return { stopId, state: "downloading", completedBytes: 0, totalBytes: 0 };
    const record = await getPackRecord(stopId);
    if (!record) return { stopId, state: "absent", completedBytes: 0, totalBytes: 0 };
    return { stopId, state: "ready", completedBytes: record.bytes, totalBytes: record.bytes, version: record.version };
  }

  async download(manifest: StopManifest) {
    this.cancel(manifest.stopId);
    const controller = new AbortController(); this.controllers.set(manifest.stopId, controller);
    const cache = await caches.open(cacheName);
    const canOpus = document.createElement("audio").canPlayType("audio/ogg; codecs=opus") !== "";
    const codec = canOpus ? "opus" : "aac";
    const files = manifest.notes.map((note) => ({ url: canOpus ? note.opusUrl : note.aacUrl, realizationId: canOpus ? note.realizations.opus : note.realizations.aac, bytes: canOpus ? note.bytes.opus : note.bytes.aac }));
    const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
    const estimate = await this.estimateStorage();
    if (estimate.quota !== undefined && estimate.usage !== undefined && totalBytes > (estimate.quota - estimate.usage) * .9) { this.controllers.delete(manifest.stopId); throw new Error("insufficient-space"); }
    let completedBytes = 0; const stored: string[] = [];
    this.emit({ stopId: manifest.stopId, state: "downloading", completedBytes, totalBytes, fraction: 0, version: manifest.packVersion });
    try {
      for (const file of files) {
        const response = await fetchVerifiedVaoResponse(file.realizationId, controller.signal);
        await cache.put(file.url, response.clone()); stored.push(file.url); completedBytes += file.bytes;
        this.emit({ stopId: manifest.stopId, state: "downloading", completedBytes, totalBytes, fraction: completedBytes / totalBytes, version: manifest.packVersion });
      }
      await putPackRecord({ stopId: manifest.stopId, version: manifest.packVersion, contentVersion: manifest.contentVersion, bytes: totalBytes, codec, installedAt: Date.now() });
      this.emit({ stopId: manifest.stopId, state: "ready", completedBytes, totalBytes, fraction: 1, version: manifest.packVersion });
    } catch (error) {
      await Promise.all(stored.map((url) => cache.delete(url)));
      if ((error as Error).name !== "AbortError") this.emit({ stopId: manifest.stopId, state: "error", completedBytes, totalBytes, fraction: totalBytes ? completedBytes / totalBytes : 0, error: (error as Error).message });
      throw error;
    } finally { this.controllers.delete(manifest.stopId); }
  }

  async remove(stopId: string) {
    this.cancel(stopId); const cache = await caches.open(cacheName); const keys = await cache.keys();
    await Promise.all(keys.filter((request) => request.url.includes(`/stops/${stopId}/`)).map((request) => cache.delete(request)));
    await deletePackRecord(stopId);
  }

  cancel(stopId: string) { this.controllers.get(stopId)?.abort(); this.controllers.delete(stopId); }
  async estimateStorage() { if (!navigator.storage?.estimate) return {}; const { usage, quota } = await navigator.storage.estimate(); return { usage, quota }; }
  async clearAll() { for (const controller of this.controllers.values()) controller.abort(); this.controllers.clear(); await caches.delete(cacheName); await clearPackRecords(); }
  onProgress(listener: (progress: PackProgress) => void): Unsubscribe { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(progress: PackProgress) { for (const listener of this.listeners) listener(progress); }
}
