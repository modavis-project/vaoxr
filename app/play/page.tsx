import type { Metadata } from "next";
import { PageIntro } from "@/app/components/PageIntro";
import { OrganPlayer } from "./OrganPlayer";

export const metadata: Metadata = { title: "Play", description: "Play the 45-note, five-stop sampled positive organ." };

export default function PlayPage() {
  return <div className="route-page page-width">
    <PageIntro eyebrow="Sampled instrument" title="Play the organ" description="Combine five stops across 45 recorded notes. Touch, drag, use a computer keyboard, or connect Web MIDI when supported." />
    <OrganPlayer />
  </div>;
}
