import type { Metadata } from "next";
import { PageIntro } from "@/app/components/PageIntro";
import { OrganViewer } from "./OrganViewer";

export const metadata: Metadata = { title: "View", description: "Explore the positive organ as an interactive 3D model." };

export default function ViewPage() {
  return <div className="route-page page-width">
    <PageIntro eyebrow="Object study" title="View the organ" description="Turn, zoom, and inspect a web-optimized model derived from the archival instrument scan. The scene loads only when this route is opened." />
    <OrganViewer />
  </div>;
}
