"use client";

import { Expand, LocateFixed, Minimize, Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { instrument } from "@/lib/content";
import { MediaPerformanceClock } from "@/lib/performance/MediaPerformanceClock";
import { fetchPerformanceTimeline } from "@/lib/performance/timeline";
import type { PerformanceSnapshot } from "@/lib/services/contracts";

type ViewerState = "loading" | "ready" | "unavailable" | "error";

export function OrganViewer() {
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<import("@/lib/three/OrganScene").OrganScene | null>(null);
  const clockRef = useRef<MediaPerformanceClock | null>(null);
  const [state, setState] = useState<ViewerState>("loading");
  const [progress, setProgress] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [performance, setPerformance] = useState<PerformanceSnapshot>({ currentTime: 0, duration: instrument.performance.durationSeconds, playing: false, ended: false });
  const [performanceError, setPerformanceError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current; const shell = shellRef.current;
    if (!canvas || !shell) return;
    const probe = document.createElement("canvas");
    if (!probe.getContext("webgl2") && !probe.getContext("webgl")) { queueMicrotask(() => setState("unavailable")); return; }
    let disposed = false; let resizeObserver: ResizeObserver | undefined;
    const initialize = async () => {
      try {
        const [{ OrganScene }, timeline] = await Promise.all([import("@/lib/three/OrganScene"), fetchPerformanceTimeline(instrument.performance.timelineUrl)]);
        if (disposed) return;
        const organScene = new OrganScene(canvas); sceneRef.current = organScene;
        await organScene.initialize(setProgress); organScene.setPerformanceTimeline(timeline);
        if (disposed) { organScene.dispose(); return; }
        resizeObserver = new ResizeObserver(() => { const { width, height } = shell.getBoundingClientRect(); organScene.resize(width, height); });
        resizeObserver.observe(shell); organScene.start();
        const clock = new MediaPerformanceClock(instrument.performance.audioRealizationId, instrument.performance.durationSeconds); clockRef.current = clock;
        clock.subscribe((snapshot) => { setPerformance(snapshot); organScene.setPerformanceTime(snapshot.currentTime); });
        setProgress(100); setState("ready");
      } catch (error) { console.error("Organ viewer failed", error); if (!disposed) setState("error"); }
    };
    void initialize();
    return () => { disposed = true; resizeObserver?.disconnect(); clockRef.current?.dispose(); clockRef.current = null; sceneRef.current?.dispose(); sceneRef.current = null; };
  }, []);

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", update); return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!shellRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen(); else await shellRef.current.requestFullscreen();
  }, []);

  const togglePerformance = async () => {
    setPerformanceError(false);
    try { if (performance.playing) clockRef.current?.pause(); else if (performance.ended) await clockRef.current?.restart(); else await clockRef.current?.play(); }
    catch { setPerformanceError(true); }
  };

  const timeLabel = (value: number) => `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, "0")}`;

  return <section className="panel viewer-shell" aria-label="Interactive organ model">
    <div className="viewer-stage" ref={shellRef}>
      <canvas ref={canvasRef} className="viewer-canvas" aria-label="Three-dimensional organ model. Drag to rotate and pinch or scroll to zoom." />
      {state === "ready" && <div className="viewer-toolbar"><button className="button button-quiet icon-button" onClick={() => sceneRef.current?.reset()} aria-label="Reset model view"><RotateCcw size={18} /></button><button className="button button-quiet icon-button" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}>{fullscreen ? <Minimize size={18} /> : <Expand size={18} />}</button></div>}
      {state === "loading" && <div className="viewer-message"><div><p className="eyebrow">Preparing model</p><h2>Loading the instrument</h2><p>The 3D scene is downloaded only for this experience.</p><div className="loading-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div></div></div>}
      {state === "unavailable" && <div className="viewer-message"><div><h2>3D graphics are unavailable</h2><p>This browser or device has WebGL disabled. The listening room and instrument descriptions remain available.</p></div></div>}
      {state === "error" && <div className="viewer-message"><div><h2>The model could not be loaded</h2><p>Check the connection, then reload this route. Any downloaded room recordings remain available.</p></div></div>}
      {state === "ready" && <div className="viewer-status"><span className="status-chip"><span className="status-dot" />Model ready</span><span className="status-chip"><LocateFixed size={13} />Drag · pinch · scroll</span></div>}
    </div>
    <footer className="performance-controls">
      <button className="button button-primary performance-play" disabled={state !== "ready"} onClick={() => void togglePerformance()}>{performance.playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}{performance.playing ? "Pause" : performance.ended ? "Restart performance" : instrument.performance.label}</button>
      <div className="performance-progress"><input type="range" min={0} max={performance.duration} step={.01} value={Math.min(performance.currentTime, performance.duration)} onChange={(event) => clockRef.current?.seek(Number(event.target.value))} aria-label="Performance position" disabled={state !== "ready"} /><div><span>{timeLabel(performance.currentTime)}</span><span>{timeLabel(performance.duration)}</span></div></div>
      <span className="performance-note">{performanceError ? "Playback was blocked — tap again" : "Audio-clock synchronized"}</span>
    </footer>
  </section>;
}
