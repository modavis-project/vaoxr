import type { Metadata } from "next";
import { PageIntro } from "@/app/components/PageIntro";
import { OfflineManager } from "./OfflineManager";

export const metadata: Metadata = { title: "Offline", description: "Manage vaoXR media stored on this device." };

export default function OfflinePage() {
  return <div className="route-page page-width">
    <PageIntro eyebrow="Device storage" title="Offline media" description="The shell and small metadata are available automatically. Large organ stops remain opt-in and independently removable." />
    <OfflineManager />
  </div>;
}
