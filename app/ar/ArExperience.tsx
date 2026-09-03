"use client";

import { Box, Headset, Move3D, Pause, Play, ScanLine, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { instrument } from "@/lib/content";
import { AR_DELIVERY_IOS_URL, AR_DELIVERY_MODEL_URL } from "@/lib/ar/deliveryModel";

type MobileArState = "loading" | "ready" | "presenting" | "failed";
type ModelViewerElement = HTMLElement & {
  canActivateAR?: boolean;
  currentTime: number;
  paused: boolean;
  play: (options?: { repetitions?: number }) => void;
  pause: () => void;
};

const sceneViewerModelUrl = `${AR_DELIVERY_MODEL_URL}&sound=${encodeURIComponent(instrument.performance.audioUrl)}`;

export function ArExperience() {
  const modelRef = useRef<ModelViewerElement | null>(null);
  const [state, setState] = useState<MobileArState>("loading");
  const [animationPlaying, setAnimationPlaying] = useState(true);
  const [firefox] = useState(() => typeof navigator !== "undefined" && /Firefox|FxiOS/i.test(navigator.userAgent));
  const [arAvailable, setArAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const model = modelRef.current;
    const handleLoad = () => {
      if (cancelled) return;
      setState("ready");
      setArAvailable(Boolean(model?.canActivateAR));
    };
    const handleError = () => { if (!cancelled) setState("failed"); };
    const handleArStatus = (event: Event) => {
      if (cancelled) return;
      const status = (event as CustomEvent<{ status?: string }>).detail?.status;
      if (status === "session-started") setState("presenting");
      else if (status === "failed") setState("failed");
      else if (status === "not-presenting") setState("ready");
    };

    model?.addEventListener("load", handleLoad);
    model?.addEventListener("error", handleError);
    model?.addEventListener("ar-status", handleArStatus);
    void import("@google/model-viewer").catch(handleError);
    return () => {
      cancelled = true;
      model?.removeEventListener("load", handleLoad);
      model?.removeEventListener("error", handleError);
      model?.removeEventListener("ar-status", handleArStatus);
    };
  }, []);

  const toggleAnimation = () => {
    const model = modelRef.current;
    if (!model) return;
    if (model.paused) model.play({ repetitions: Infinity }); else model.pause();
    setAnimationPlaying(!model.paused);
  };

  return <section className="panel mobile-ar-experience" aria-label="Mobile augmented reality">
    <div className="mobile-ar-stage">
      <model-viewer
        ref={modelRef}
        src={sceneViewerModelUrl}
        ios-src={AR_DELIVERY_IOS_URL}
        alt="Historic positive organ ready for placement"
        ar
        ar-modes="webxr scene-viewer quick-look"
        ar-placement="floor"
        ar-scale="auto"
        autoplay
        animation-name="Pachelbel performance"
        animation-crossfade-duration="0"
        camera-controls
        touch-action="pan-y"
        camera-orbit="35deg 72deg 115%"
        min-camera-orbit="auto 35deg 75%"
        max-camera-orbit="auto 90deg 220%"
        shadow-intensity="1"
        shadow-softness=".8"
        exposure="1.05"
        tone-mapping="neutral"
        xr-environment
      >
        <button slot="ar-button" className="button button-primary mobile-ar-button" disabled={state === "loading" || state === "failed"}>
          <ScanLine size={18} />{state === "loading" ? "Preparing organ" : state === "presenting" ? "AR active" : "Place in your room"}
        </button>
        <div slot="progress-bar" className="mobile-ar-progress" aria-hidden="true"><span className="update-bar" /></div>
      </model-viewer>
      <span className="mobile-ar-scale"><Move3D size={15} />Open-model width · {instrument.model.physicalWidthMetres.toFixed(1)} m</span>
      <button className="button mobile-ar-animation" onClick={toggleAnimation} disabled={state !== "ready"}>
        {animationPlaying ? <Pause size={15} /> : <Play size={15} />}{animationPlaying ? "Pause keys" : "Animate keys"}
      </button>
    </div>

    <aside className="mobile-ar-guide">
      <span className="mode-chip"><Smartphone size={16} />Phone and tablet</span>
      <h2>Place it—no marker required.</h2>
      <p>Open this page on your phone, tap <strong>Place in your room</strong>, scan the floor, then position the organ with touch gestures.</p>
      <ol>
        <li><span>1</span><div><strong>Scan the floor</strong><small>Move the phone slowly until a placement surface appears.</small></div></li>
        <li><span>2</span><div><strong>Tap to place</strong><small>Drag, rotate, or pinch until the organ sits naturally in the room.</small></div></li>
        <li><span>3</span><div><strong>Walk around it</strong><small>The model remains anchored while you inspect it at physical scale.</small></div></li>
      </ol>
      {firefox && <p className="notice">The 3D preview works here, but room placement is not available reliably in Firefox. For AR, open this page in Chrome on an ARCore Android phone or Safari on iPhone.</p>}
      {!firefox && (state === "failed" || arAvailable === false) && <p className="notice">Room placement is unavailable on this device or browser. Open this page in Chrome on an ARCore Android phone or Safari on iPhone, or use the 3D preview.</p>}
      <div className="mobile-ar-alternatives">
        <a className="quest-mode-link" href="/ar/quest"><Headset size={22} /><span><strong>Using Meta Quest 3?</strong><small>Open the dedicated passthrough experience</small></span></a>
        <a className="button" href="/view"><Box size={16} />Open the 3D view</a>
      </div>
    </aside>
  </section>;
}
