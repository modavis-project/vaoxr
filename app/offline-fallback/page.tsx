import { WifiOff } from "lucide-react";

export default function OfflineFallback() {
  return <div className="route-page page-width"><section className="panel capability-layout">
    <div className="capability-copy"><p className="eyebrow">Offline</p><h2>This page is not stored on this device yet.</h2><p>The vaoXR shell is available, but this experience needs a connection or an explicitly downloaded media pack.</p><div className="capability-actions"><a className="button button-primary" href="/">Return home</a><a className="button" href="/offline">Manage downloads</a></div></div>
    <div className="capability-details"><WifiOff size={38} aria-hidden="true" /><h3>Connection unavailable</h3><p>Reconnect once to make recently viewed content available for future visits.</p></div>
  </section></div>;
}
