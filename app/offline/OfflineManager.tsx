"use client";

import { AlertTriangle, Download, HardDrive, Info, PauseCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { instrument } from "@/lib/content";
import { fetchStopManifest } from "@/lib/audio/manifest";
import { BrowserMediaPackManager } from "@/lib/storage/BrowserMediaPackManager";
import type { PackStatus } from "@/lib/services/contracts";

function bytes(value = 0) { if (!value) return "0 MB"; return `${(value / 1024 / 1024).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`; }

export function OfflineManager() {
  const managerRef = useRef<BrowserMediaPackManager | null>(null);
  const [statuses, setStatuses] = useState<Record<string, PackStatus>>({});
  const [storage, setStorage] = useState<{ usage?: number; quota?: number }>({});
  const [message, setMessage] = useState<string>();

  const refresh = useCallback(async () => {
    const manager = managerRef.current; if (!manager) return;
    const entries = await Promise.all(instrument.stops.map(async (stop) => {
      const status = await manager.getStatus(stop.id);
      if (status.state === "ready" && status.version !== stop.packVersion) status.state = "stale";
      return [stop.id, status] as const;
    }));
    setStatuses(Object.fromEntries(entries)); setStorage(await manager.estimateStorage());
  }, []);

  useEffect(() => {
    const manager = new BrowserMediaPackManager(); managerRef.current = manager;
    const unsubscribe = manager.onProgress((progress) => setStatuses((current) => ({ ...current, [progress.stopId]: progress })));
    void refresh(); return () => { unsubscribe(); instrument.stops.forEach((stop) => manager.cancel(stop.id)); };
  }, [refresh]);

  const download = async (stopId: string) => {
    const descriptor = instrument.stops.find((stop) => stop.id === stopId); const manager = managerRef.current; if (!descriptor || !manager) return;
    setMessage(undefined);
    try { await manager.download(await fetchStopManifest(descriptor.manifestRealizationId)); setMessage(`${descriptor.label} is ready offline.`); }
    catch (error) { if ((error as Error).name !== "AbortError") setMessage((error as Error).message === "insufficient-space" ? "There is not enough available browser storage for this pack." : `${descriptor.label} could not be downloaded.`); }
    await refresh();
  };
  const remove = async (stopId: string) => { await managerRef.current?.remove(stopId); await refresh(); };
  const clearAll = async () => { await managerRef.current?.clearAll(); setMessage("All explicitly downloaded stop packs were removed."); await refresh(); };

  return <div className="offline-layout">
    <section className="panel storage-summary">
      <div><p className="eyebrow">Browser storage estimate</p><h2>{storage.quota ? `${bytes(storage.usage)} used` : "Estimate unavailable"}</h2><p>{storage.quota ? `${bytes(Math.max(0, (storage.quota ?? 0) - (storage.usage ?? 0)))} available of ${bytes(storage.quota)}` : "This browser does not expose a quota estimate. Downloads still report failures safely."}</p></div>
      <div className="storage-meter" role="progressbar" aria-label="Browser storage used" aria-valuemin={0} aria-valuemax={storage.quota ?? 1} aria-valuenow={storage.usage ?? 0}><span style={{ width: `${storage.quota ? Math.min(100, (storage.usage ?? 0) / storage.quota * 100) : 0}%` }} /></div>
      <div className="notice"><Info size={18} /><span>The browser can reclaim cached data under storage pressure. vaoXR verifies every pack version before treating it as available.</span></div>
    </section>
    {message && <div className="notice offline-message"><AlertTriangle size={18} /><span>{message}</span></div>}
    <section className="pack-list panel" aria-label="Organ stop media packs">
      {instrument.stops.map((stop) => {
        const status = statuses[stop.id] ?? { stopId: stop.id, state: "absent", completedBytes: 0, totalBytes: 0 };
        const fraction = status.totalBytes ? status.completedBytes / status.totalBytes : 0;
        return <article className="pack-row" key={stop.id}>
          <div className="pack-icon"><HardDrive size={20} /></div>
          <div className="pack-copy"><h3>{stop.label}</h3><p>{status.state === "ready" ? `${bytes(status.totalBytes)} · available offline` : status.state === "stale" ? "A newer pack version is available" : status.state === "downloading" ? `${Math.round(fraction * 100)}% · ${bytes(status.completedBytes)} of ${bytes(status.totalBytes)}` : "45 recorded notes · Opus or AAC selected for this browser"}</p>{status.state === "downloading" && <div className="pack-progress"><span style={{ width: `${fraction * 100}%` }} /></div>}</div>
          <div className="pack-actions">{status.state === "ready" ? <button className="button button-danger" onClick={() => void remove(stop.id)}><Trash2 size={15} />Remove</button> : status.state === "downloading" ? <button className="button" onClick={() => managerRef.current?.cancel(stop.id)}><PauseCircle size={15} />Cancel</button> : <button className="button" onClick={() => void download(stop.id)}><Download size={15} />Download</button>}</div>
        </article>;
      })}
    </section>
    <div className="offline-clear"><button className="button button-danger" onClick={() => void clearAll()}><Trash2 size={16} />Clear all downloaded packs</button><span>Runtime-cached viewer and room media remain browser-managed.</span></div>
  </div>;
}
