"use client";

import { Eye, Hand, Lightbulb, LocateFixed, Move3D, Music2, Pause, Play, RotateCcw, ScanFace, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { instrument } from "@/lib/content";
import type {
  WebXrExperienceMode,
  WebXrPlacementSession,
  WebXrSessionState,
  WebXrTransform,
} from "@/lib/ar/WebXrPlacementSession";

const statusCopy: Record<WebXrSessionState, string> = {
  starting: "Opening mixed reality",
  loading: "Loading the verified organ",
  scanning: "Aim at a clear floor area · place on green",
  stabilizing: "Hold steady · waiting for a stable surface",
  placed: "Organ placed · grip to choose another position",
};

export function WebXrPlacement({ disabled = false }: { disabled?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<WebXrPlacementSession | null>(null);
  const constructorRef = useRef<typeof import("@/lib/ar/WebXrPlacementSession").WebXrPlacementSession | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<WebXrSessionState>("starting");
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [lightIntensity, setLightIntensity] = useState(0.65);
  const [animationPlaying, setAnimationPlaying] = useState(true);
  const [launchMode, setLaunchMode] = useState<WebXrExperienceMode>("play");
  const [stopId, setStopId] = useState(instrument.stops.find((stop) => stop.defaultSelected)?.id ?? instrument.stops[0].id);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("@/lib/ar/WebXrPlacementSession").then(({ WebXrPlacementSession: SessionConstructor }) => {
      if (cancelled) return;
      constructorRef.current = SessionConstructor;
      setReady(true);
    });
    return () => {
      cancelled = true;
      void sessionRef.current?.end();
      sessionRef.current = null;
    };
  }, []);

  const closeOverlay = () => {
    if (rootRef.current) rootRef.current.dataset.open = "false";
    sessionRef.current = null;
    setOpen(false);
  };

  const syncTransform = (transform: WebXrTransform) => {
    setScale(transform.scale);
    setRotation(transform.rotation);
    setVolume(transform.volume);
    setLightIntensity(transform.lightIntensity);
    setAnimationPlaying(transform.animationPlaying);
    setLaunchMode(transform.mode);
  };

  const start = async () => {
    const SessionConstructor = constructorRef.current;
    if (disabled || !SessionConstructor || !rootRef.current || !canvasRef.current || sessionRef.current) return;
    rootRef.current.dataset.open = "true";
    setOpen(true);
    setError(null);
    setStatus("starting");
    const session = new SessionConstructor(canvasRef.current, setStatus, syncTransform, closeOverlay, { mode: launchMode, stopId });
    sessionRef.current = session;
    try {
      // start() immediately requests the XR session, preserving this click's
      // user activation on Meta Quest Browser.
      await session.start();
    } catch (caught) {
      await session.end();
      sessionRef.current = null;
      if (rootRef.current) rootRef.current.dataset.open = "true";
      setOpen(true);
      const message = caught instanceof Error ? caught.message : "Unknown WebXR startup error";
      console.error("[vaoXR WebXR] Session startup failed", caught);
      setError(message);
    }
  };

  const exit = async () => {
    const activeSession = sessionRef.current;
    sessionRef.current = null;
    if (activeSession) await activeSession.end();
    closeOverlay();
  };

  return <div className="quest-xr-launcher">
    <div className="quest-mode-picker" role="group" aria-label="Quest mixed-reality mode">
      <button type="button" aria-pressed={launchMode === "play"} onClick={() => setLaunchMode("play")} disabled={open}><Hand size={16} /><span><strong>Play with hands</strong><small>Touch keys; held sounds sustain</small></span></button>
      <button type="button" aria-pressed={launchMode === "performance"} onClick={() => setLaunchMode("performance")} disabled={open}><Eye size={16} /><span><strong>Watch performance</strong><small>Synchronized recording and keys</small></span></button>
    </div>
    {launchMode === "play" && <div className="quest-stop-picker" role="radiogroup" aria-label="Initial organ stop for hand playing">
      <span><Music2 size={15} />Initial stop · toggle all five on the organ</span>
      <div>{instrument.stops.map((stop) => <button key={stop.id} type="button" role="radio" aria-checked={stopId === stop.id} onClick={() => setStopId(stop.id)} disabled={open}>{stop.label}</button>)}</div>
    </div>}
    <button className="button button-primary quest-enter-xr" onClick={() => void start()} disabled={disabled || !ready} title={disabled ? "Stop the camera before entering mixed reality" : undefined}>
      {launchMode === "play" ? <Hand size={16} /> : <Move3D size={16} />}{ready ? launchMode === "play" ? "Enter and play" : "Enter performance" : "Preparing mixed reality"}
    </button>
    <div className="webxr-overlay" data-open={open ? "true" : "false"} aria-hidden={!open} ref={rootRef}>
      <canvas ref={canvasRef} aria-label="Mixed-reality organ placement" />
      <div className="webxr-top">
        <span className="status-chip"><LocateFixed size={14} />{error ? "Mixed reality unavailable" : status === "loading" && launchMode === "play" ? "Loading verified playable stops" : statusCopy[status]}</span>
        <button className="button icon-button" onClick={() => void exit()} aria-label="Exit mixed reality"><X size={18} /></button>
      </div>
      {!error && <div className="webxr-controls">
        <p className="webxr-help">{launchMode === "play" ? "Trigger/pinch: place · Hands: keys and stops · Left stick: scale · Controller trigger: keys, stops, and light handles · Grip: move" : "Trigger/pinch: place · Left stick: scale · Trigger: grab light handles · A/X: music · B/Y: face you"}</p>
        <div><label htmlFor="xr-scale">Scale · {Math.round(scale * 100)}%</label><input id="xr-scale" type="range" min={0.5} max={3.5} step={0.01} value={scale} onChange={(event) => sessionRef.current?.setScale(Number(event.target.value))} /></div>
        <div><label htmlFor="xr-rotation">Rotate · {Math.round(rotation)}°</label><input id="xr-rotation" type="range" min={-180} max={180} step={1} value={rotation} onChange={(event) => sessionRef.current?.setRotation(Number(event.target.value))} /></div>
        <div><label htmlFor="xr-volume">{volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />} Volume · {Math.round(volume * 100)}%</label><input id="xr-volume" type="range" min={0} max={1} step={0.01} value={volume} onChange={(event) => sessionRef.current?.setVolume(Number(event.target.value))} /></div>
        <div><label htmlFor="xr-light"><Lightbulb size={13} /> Artificial light · {Math.round(lightIntensity * 100)}%</label><input id="xr-light" type="range" min={0} max={1.5} step={0.01} value={lightIntensity} onChange={(event) => sessionRef.current?.setLightIntensity(Number(event.target.value))} /></div>
        <button className="button" onClick={() => sessionRef.current?.move()} disabled={status !== "placed"}><Move3D size={16} />Move</button>
        <button className="button" onClick={() => sessionRef.current?.faceViewer()} disabled={status !== "placed"}><ScanFace size={16} />Face me</button>
        <button className="button" onClick={() => sessionRef.current?.resetArtificialLight()} disabled={status !== "placed"}><Lightbulb size={16} />Reset light</button>
        {launchMode === "performance" && <button className="button" onClick={() => sessionRef.current?.toggleAnimation()} disabled={status !== "placed"}>{animationPlaying ? <Pause size={16} /> : <Play size={16} />}{animationPlaying ? "Pause keys" : "Animate keys"}</button>}
        {launchMode === "performance" && <button className="button" onClick={() => sessionRef.current?.restartAnimation()} disabled={status !== "placed"}><Play size={16} />Restart music</button>}
        <button className="button" onClick={() => sessionRef.current?.reset()}><RotateCcw size={16} />Reset</button>
      </div>}
      {error && <div className="webxr-error"><h2>Mixed reality could not start.</h2><p>{error}</p><p>Open this route in Meta Quest Browser, or continue with mobile AR and the 3D viewer.</p><button className="button button-primary" onClick={() => void exit()}>Return to Quest options</button></div>}
    </div>
  </div>;
}
