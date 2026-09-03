import type { Metadata } from "next";
import { PageIntro } from "@/app/components/PageIntro";
import { RoomListener } from "./RoomListener";

export const metadata: Metadata = { title: "Room", description: "Listen to the organ from four positions in its room." };

export default function RoomPage() {
  return <div className="route-page page-width">
    <PageIntro eyebrow="Spatial listening" title="Hear the room" description="Choose one of four stereo recordings to compare how architecture changes the instrument. Headphones reveal the differences most clearly." />
    <RoomListener />
  </div>;
}
