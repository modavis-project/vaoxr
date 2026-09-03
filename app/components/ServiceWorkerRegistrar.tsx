"use client";

import { RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useRef } from "react";
import { isAppActive } from "@/lib/pwa/activity";

export function ServiceWorkerRegistrar() {
  const [waiting, setWaiting] = useState<ServiceWorker>();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const reloadOnControllerChange = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | undefined;
    const capture = () => { if (registration?.waiting && navigator.serviceWorker.controller) { setWaiting(registration.waiting); setDismissed(false); } };
    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }); capture();
        registration.addEventListener("updatefound", () => registration?.installing?.addEventListener("statechange", capture));
      } catch { /* The app remains fully usable without installation support. */ }
    };
    const activity = () => setBusy(isAppActive());
    const controllerChange = () => { if (reloadOnControllerChange.current) location.reload(); };
    if (document.readyState === "complete") void register(); else window.addEventListener("load", register, { once: true });
    window.addEventListener("positivxr:activity", activity); navigator.serviceWorker.addEventListener("controllerchange", controllerChange);
    return () => { window.removeEventListener("load", register); window.removeEventListener("positivxr:activity", activity); navigator.serviceWorker.removeEventListener("controllerchange", controllerChange); };
  }, []);

  if (!waiting || dismissed) return null;
  return <aside className="update-prompt" role="status" aria-live="polite"><RefreshCw size={19} /><div><strong>vaoXR update ready</strong><span>{busy ? "Finish audio or AR, then update safely." : "Reload to use the latest application version."}</span></div><button className="button button-primary" disabled={busy} onClick={() => { reloadOnControllerChange.current = true; waiting.postMessage({ type: "SKIP_WAITING" }); }}>Update</button><button className="button icon-button" onClick={() => setDismissed(true)} aria-label="Dismiss update"><X size={17} /></button></aside>;
}
