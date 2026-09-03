import type { ImmersiveXrProbe, TrackingProbe } from "./contracts";

export async function probeImageTracking(): Promise<TrackingProbe> {
  if (typeof window === "undefined") return { available: false, reason: "client-only" };
  if (!window.isSecureContext && location.hostname !== "localhost") return { available: false, reason: "secure-context-required" };
  if (!navigator.mediaDevices?.getUserMedia) return { available: false, reason: "camera-api-unavailable" };
  return { available: true };
}

export async function probeWebXR(): Promise<TrackingProbe> {
  const result = await probeImmersiveXr();
  return result.immersiveAr ? { available: true } : { available: false, reason: result.reason ?? "immersive-ar-unavailable" };
}

export async function probeImmersiveXr(): Promise<ImmersiveXrProbe> {
  if (typeof navigator === "undefined" || !("xr" in navigator) || !navigator.xr) {
    return { available: false, immersiveAr: false, immersiveVr: false, reason: "webxr-unavailable" };
  }
  try {
    const [immersiveAr, immersiveVr] = await Promise.all([
      navigator.xr.isSessionSupported("immersive-ar"),
      navigator.xr.isSessionSupported("immersive-vr"),
    ]);
    return {
      available: immersiveAr || immersiveVr,
      immersiveAr,
      immersiveVr,
      preferredMode: immersiveAr ? "immersive-ar" : immersiveVr ? "immersive-vr" : undefined,
      reason: immersiveAr || immersiveVr ? undefined : "immersive-session-unavailable",
    };
  } catch {
    return { available: false, immersiveAr: false, immersiveVr: false, reason: "webxr-probe-failed" };
  }
}

export function probeWebMidi(): boolean { return typeof navigator !== "undefined" && "requestMIDIAccess" in navigator; }
