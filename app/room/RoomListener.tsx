"use client";

import { Headphones, Pause, Play, Volume2 } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { building } from "@/lib/content";
import { fetchVerifiedVaoBytes } from "@/lib/vao/integrity";
import { getVaoRealization } from "@/lib/vao/release";

function timeLabel(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  const minutes = Math.floor(value / 60); const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function RoomListener() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [selectedId, setSelectedId] = useState(building.points[0].id);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const objectUrlRef = useRef<string | undefined>(undefined);
  const selected = useMemo(() => building.points.find((point) => point.id === selectedId) ?? building.points[0], [selectedId]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;
    const sync = () => { setCurrentTime(audio.currentTime); setDuration(audio.duration || 0); };
    const stop = () => setPlaying(false);
    audio.addEventListener("timeupdate", sync); audio.addEventListener("durationchange", sync); audio.addEventListener("ended", stop); audio.addEventListener("pause", stop);
    return () => { audio.pause(); audio.removeAttribute("src"); audio.load(); if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = undefined; audio.removeEventListener("timeupdate", sync); audio.removeEventListener("durationchange", sync); audio.removeEventListener("ended", stop); audio.removeEventListener("pause", stop); audioRef.current = null; };
  }, []);

  const choose = async (id: string) => {
    const point = building.points.find((item) => item.id === id); const audio = audioRef.current;
    if (!point || !audio) return;
    if (selectedId === id && playing) { audio.pause(); return; }
    const same = selectedId === id;
    if (!same || !audio.src) {
      audio.pause();
      const bytes = await fetchVerifiedVaoBytes(point.audio.realizationId);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = URL.createObjectURL(new Blob([bytes], { type: getVaoRealization(point.audio.realizationId).mediaType }));
      audio.src = objectUrlRef.current; audio.currentTime = 0; setCurrentTime(0); setSelectedId(id);
    }
    try { await audio.play(); setPlaying(true); } catch { setPlaying(false); }
  };

  const seek = (value: number) => { if (audioRef.current) { audioRef.current.currentTime = value; setCurrentTime(value); } };

  return <div className="room-layout">
    <section className="panel plan-panel" aria-label="Floor plan with listening positions">
      <div className="notice"><Headphones size={19} /><span>Use headphones, then select a numbered point. Starting another recording always stops the previous one.</span></div>
      <div className="floor-plan">
        <Image src={building.floorPlanUrl} width={905} height={1015} alt="Architectural floor plan of the organ room" />
        {building.points.map((point, index) => <button key={point.id} className="listening-point" style={{ left: `${point.position.x * 100}%`, top: `${point.position.y * 100}%` }} data-active={selectedId === point.id && playing} onClick={() => void choose(point.id)} aria-label={`${playing && selectedId === point.id ? "Pause" : "Play"} ${point.label}`}>{selectedId === point.id && playing ? <Pause size={16} fill="currentColor" /> : index + 1}</button>)}
      </div>
    </section>
    <aside className="panel room-sidebar">
      <div><p className="eyebrow">Selected position</p><h2>{selected.label}</h2></div>
      <p className="room-description">{selected.description}</p>
      <div className="room-list" role="list" aria-label="Listening positions">
        {building.points.map((point, index) => <button key={point.id} onClick={() => void choose(point.id)} aria-current={selectedId === point.id ? "true" : undefined}><strong>{index + 1}. {point.label}</strong><small>{selectedId === point.id && playing ? "Playing now" : "Stereo recording"}</small></button>)}
      </div>
      <div className="audio-controls">
        <div className="audio-control-row"><button className="button icon-button" onClick={() => void choose(selected.id)} aria-label={playing ? "Pause recording" : "Play recording"}>{playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button><Volume2 size={18} aria-hidden="true" /><input type="range" min={0} max={duration || 0} step={.1} value={Math.min(currentTime, duration || 0)} onChange={(event) => seek(Number(event.target.value))} aria-label="Recording position" disabled={!duration} /></div>
        <div className="time-readout"><span>{timeLabel(currentTime)}</span><span>{timeLabel(duration)}</span></div>
      </div>
    </aside>
  </div>;
}
