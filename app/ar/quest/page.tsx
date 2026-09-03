import type { Metadata } from "next";
import { PageIntro } from "@/app/components/PageIntro";
import { QuestArExperience } from "./QuestArExperience";

export const metadata: Metadata = {
  title: "Meta Quest AR",
  description: "Place and play the positive organ with tracked hands in Meta Quest 3 passthrough mixed reality.",
};

export default function QuestArPage() {
  return <div className="route-page page-width">
    <PageIntro eyebrow="Meta Quest 3" title="Enter the organ’s space" description="A dedicated passthrough experience for verified performance playback and direct hand-tracked organ playing." />
    <QuestArExperience />
  </div>;
}
