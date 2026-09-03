import type { Metadata } from "next";
import { PageIntro } from "@/app/components/PageIntro";
import { ArExperience } from "./ArExperience";

export const metadata: Metadata = { title: "Mobile AR", description: "Place the positive organ at physical scale on a phone or tablet without a printed marker." };

export default function ArPage() {
  return <div className="route-page page-width">
    <PageIntro eyebrow="Mobile augmented reality" title="Place the organ" description="The primary AR experience works through your phone’s supported system viewer. Scan the floor and choose the position yourself—no printed marker required." />
    <ArExperience />
  </div>;
}
