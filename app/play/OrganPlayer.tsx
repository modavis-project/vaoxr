"use client";

import { AlertTriangle, Keyboard, LoaderCircle, Music2, Power, SlidersHorizontal, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { instrument } from "@/lib/content";
import { WebAudioEngine } from "@/lib/audio/WebAudioEngine";
import { fetchStopManifest } from "@/lib/audio/manifest";
import type { StopManifest } from "@/lib/content";
import { computerKeyMap } from "@/lib/audio/notes";

const blackPitchClasses = new Set([1, 3, 6, 8, 10]);

function noteName(midi: number) {
  const names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function OrganPlayer() {
  const engineRef = useRef<WebAudioEngine | null>(null);
  const manifestsRef = useRef(new Map<string, StopManifest>());
  const pointersRef = useRef(new Map<number, number>());
  const keyboardNotesRef = useRef(new Set<number>());
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Activate audio to begin");
  const [error, setError] = useState<string>();
  const [activeNotes, setActiveNotes] = useState<Set<number>>(() => new Set());
  const [selectedStops, setSelectedStops] = useState<Set<string>>(() => new Set(["ged"]));
  const [volume, setVolume] = useState(.72);
  const [midiConnected, setMidiConnected] = useState(false);
  const [midiAvailable, setMidiAvailable] = useState(false);
  const selectedStopIds = useMemo(() => [...selectedStops], [selectedStops]);

  useEffect(() => {
    const savedStops = localStorage.getItem("positivxr:selected-stops");
    const savedVolume = Number(localStorage.getItem("positivxr:volume"));
    const timer = window.setTimeout(() => {
      if (savedStops) { const ids = JSON.parse(savedStops) as string[]; if (ids.length) setSelectedStops(new Set(ids)); }
      if (Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1) setVolume(savedVolume);
      setMidiAvailable("requestMIDIAccess" in navigator);
    });
    const engine = new WebAudioEngine(); engineRef.current = engine;
    const pointers = pointersRef.current; const keyboardNotes = keyboardNotesRef.current;
    return () => { window.clearTimeout(timer); pointers.clear(); keyboardNotes.clear(); engine.dispose(); engineRef.current = null; };
  }, []);

  const loadStop = useCallback(async (stopId: string) => {
    if (manifestsRef.current.has(stopId)) return;
    const descriptor = instrument.stops.find((stop) => stop.id === stopId); if (!descriptor) return;
    const manifest = await fetchStopManifest(descriptor.manifestRealizationId);
    manifestsRef.current.set(stopId, manifest); await engineRef.current?.loadStop(manifest);
  }, []);

  const activate = useCallback(async () => {
    setLoading(true); setError(undefined);
    try {
      await engineRef.current?.unlock(); engineRef.current?.setMasterGain(volume);
      await Promise.all(selectedStopIds.map(loadStop));
      setUnlocked(true); setStatus(`${selectedStopIds.length} stop${selectedStopIds.length === 1 ? "" : "s"} ready`);
    } catch { setError("Audio could not be activated. Check browser audio permissions and try again."); }
    finally { setLoading(false); }
  }, [loadStop, selectedStopIds, volume]);

  const startNote = useCallback((midi: number, velocity = 1) => {
    if (!unlocked || activeNotes.has(midi)) return;
    engineRef.current?.noteOn(midi, selectedStopIds, velocity);
    setActiveNotes((notes) => new Set(notes).add(midi));
  }, [activeNotes, selectedStopIds, unlocked]);
  const stopNote = useCallback((midi: number) => {
    engineRef.current?.noteOff(midi);
    setActiveNotes((notes) => { const next = new Set(notes); next.delete(midi); return next; });
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => { const midi = computerKeyMap.get(event.code); if (midi === undefined || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return; event.preventDefault(); keyboardNotesRef.current.add(midi); startNote(midi); };
    const up = (event: KeyboardEvent) => { const midi = computerKeyMap.get(event.code); if (midi === undefined || !keyboardNotesRef.current.has(midi)) return; keyboardNotesRef.current.delete(midi); stopNote(midi); };
    const blur = () => { for (const midi of keyboardNotesRef.current) stopNote(midi); keyboardNotesRef.current.clear(); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [startNote, stopNote]);

  const pointerStart = (event: React.PointerEvent<HTMLButtonElement>, midi: number) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); pointersRef.current.set(event.pointerId, midi); startNote(midi); };
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-midi]");
    const next = Number(element?.dataset.midi); const previous = pointersRef.current.get(event.pointerId);
    if (!Number.isInteger(next) || next === previous) return;
    if (previous !== undefined) stopNote(previous); pointersRef.current.set(event.pointerId, next); startNote(next);
  };
  const pointerEnd = (event: React.PointerEvent<HTMLDivElement>) => { const midi = pointersRef.current.get(event.pointerId); if (midi !== undefined) stopNote(midi); pointersRef.current.delete(event.pointerId); };

  const toggleStop = async (stopId: string) => {
    const next = new Set(selectedStops);
    if (next.has(stopId) && next.size > 1) next.delete(stopId); else next.add(stopId);
    setSelectedStops(next); localStorage.setItem("positivxr:selected-stops", JSON.stringify([...next]));
    if (unlocked && next.has(stopId)) { setStatus("Loading stop…"); try { await loadStop(stopId); setStatus(`${next.size} stops ready`); } catch { setError(`The ${stopId} sample pack is unavailable.`); } }
  };

  const connectMidi = async () => {
    const request = (navigator as Navigator & { requestMIDIAccess?: () => Promise<{ inputs: Map<string, { onmidimessage: ((event: { data: Uint8Array }) => void) | null }> }> }).requestMIDIAccess;
    if (!request) return;
    try {
      const access = await request.call(navigator);
      for (const input of access.inputs.values()) input.onmidimessage = ({ data }) => { const [command, midi, velocity] = data; if ((command & 0xf0) === 0x90 && velocity > 0) startNote(midi, velocity / 127); else if ((command & 0xf0) === 0x80 || ((command & 0xf0) === 0x90 && velocity === 0)) stopNote(midi); };
      setMidiConnected(true);
    } catch { setStatus("MIDI permission was not granted — touch and keyboard remain available"); }
  };

  return <section className="panel organ-player">
    <div className="organ-console">
      <div className="player-heading"><div><p className="eyebrow">Five-stop console</p><h2>{unlocked ? status : "Ready when you are"}</h2></div><span className="status-chip"><span className={`status-dot ${unlocked ? "" : "status-dot-muted"}`} />{unlocked ? "Audio active" : "Audio locked"}</span></div>
      {error && <div className="notice player-error"><AlertTriangle size={18} /><span>{error}</span></div>}
      <div className="stop-row" aria-label="Organ stops">{instrument.stops.map((stop) => <button key={stop.id} className="stop-control" data-selected={selectedStops.has(stop.id)} aria-pressed={selectedStops.has(stop.id)} onClick={() => void toggleStop(stop.id)}><span className="stop-knob" /><strong>{stop.label}</strong><small>{selectedStops.has(stop.id) ? "Selected" : "Off"}</small></button>)}</div>
      <div className="keyboard-wrap" onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd}>
        <div className="keyboard-surface" aria-label="45-note organ keyboard">{instrument.notes.map((midi) => <button key={midi} data-midi={midi} className={`organ-key ${blackPitchClasses.has(midi % 12) ? "black-key" : "white-key"}`} data-active={activeNotes.has(midi)} onPointerDown={(event) => pointerStart(event, midi)} aria-label={`${noteName(midi)}, MIDI note ${midi}`}><span>{midi % 12 === 0 || midi === instrument.notes[0] ? noteName(midi) : ""}</span></button>)}</div>
      </div>
      {!unlocked && <div className="audio-gate"><Music2 size={34} /><h3>Activate the instrument</h3><p>A user gesture is required before browsers allow low-latency audio. The default Gedackt 8′ stop is prepared after activation.</p><button className="button button-primary" onClick={() => void activate()} disabled={loading}>{loading ? <LoaderCircle className="spin" size={17} /> : <Power size={17} />}{loading ? "Preparing samples…" : "Activate audio"}</button></div>}
    </div>
    <footer className="player-footer">
      <div className="volume-control"><Volume2 size={17} /><label htmlFor="master-volume">Volume</label><input id="master-volume" type="range" min={0} max={1} step={.01} value={volume} onChange={(event) => { const value = Number(event.target.value); setVolume(value); localStorage.setItem("positivxr:volume", String(value)); engineRef.current?.setMasterGain(value); }} /></div>
      <div className="player-options"><span><SlidersHorizontal size={15} />96 MiB decoded cache</span><span><Keyboard size={15} />Computer keys enabled</span>{midiAvailable && <button className="button" onClick={() => void connectMidi()}>{midiConnected ? "MIDI connected" : "Connect MIDI"}</button>}</div>
    </footer>
    <div className="player-privacy">MIDI access is optional, requested only when you choose Connect MIDI, and never transmits instrument data to a server.</div>
  </section>;
}
