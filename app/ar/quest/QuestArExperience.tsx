"use client";

import { Box, CheckCircle2, Headset, Lightbulb, Move3D, ScanLine, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { probeImmersiveXr } from "@/lib/services/capabilities";
import { WebXrPlacement } from "../WebXrPlacement";

export function QuestArExperience() {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    void probeImmersiveXr().then((probe) => setAvailable(probe.immersiveAr));
  }, []);

  return <section className="panel quest-ar-experience" aria-label="Meta Quest mixed reality">
    <div className="quest-ar-launch">
      <span className="mode-chip"><Headset size={16} />Meta Quest 3 · Passthrough</span>
      <h2>Place it. Then play it.</h2>
      <p>Choose hand playing or the recorded performance, place the verified organ on a stable floor surface, and use direct fingertip contact on its 45 keys and five physical stops.</p>
      <div className="quest-ar-actions">
        {available === null && <button className="button button-primary" disabled><ScanLine size={17} />Checking headset</button>}
        {available && <WebXrPlacement />}
        {available === false && <p className="notice">Immersive passthrough is unavailable here. Open this route directly in Meta Quest Browser.</p>}
        <a className="button" href="/view"><Box size={16} />3D fallback</a>
      </div>
      <p className="quest-ar-note"><CheckCircle2 size={16} />No room images are uploaded. Surface detection and rendering stay on the headset.</p>
    </div>

    <aside className="quest-ar-controls">
      <h3>Quest controls</h3>
      <ol>
        <li><ScanLine size={18} /><span><strong>Scan and place</strong><small>Hold steady on amber; trigger or pinch when the floor ring turns green.</small></span></li>
        <li><span className="control-glyph">☝</span><span><strong>Play keys and stops</strong><small>Put the controllers down and press keys with any fingertip. Touch a stop on the left to toggle its rank; its recorded mechanical motion shows the state. Held keys sustain from verified VAO loops.</small></span></li>
        <li><span className="control-glyph">◉</span><span><strong>Scale with controllers</strong><small>Use the left thumbstick up/down to resize. Press either stick for life size. Hand gestures are reserved for playing, so scaling cannot trigger accidentally.</small></span></li>
        <li><Lightbulb size={18} /><span><strong>Edit the subtle light</strong><small>Point and hold trigger on the small amber source to move it, or on the cyan aim point to rotate the beam. The source always faces its target.</small></span></li>
        <li><Move3D size={18} /><span><strong>Controller interaction</strong><small>Point and trigger stops to toggle them, or hold trigger on a key to play when hand tracking is unavailable.</small></span></li>
        <li><span className="control-glyph">↔</span><span><strong>Rotate and volume</strong><small>Right thumbstick left/right rotates the organ; up/down changes volume.</small></span></li>
        <li><span className="control-glyph">G</span><span><strong>Grip</strong><small>Hide the organ and choose a new floor position.</small></span></li>
        <li><span className="control-glyph">A</span><span><strong>A / X</strong><small>In Performance mode, pause or resume the synchronized moving keys and organ audio.</small></span></li>
        <li><span className="control-glyph">B</span><span><strong>B / Y</strong><small>Turn the front of the organ toward you.</small></span></li>
      </ol>
      <a className="quest-mobile-return" href="/ar"><Smartphone size={18} /><span><strong>Mobile AR</strong><small>Return to the phone-first experience</small></span></a>
    </aside>
  </section>;
}
