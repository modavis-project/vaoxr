let activeCount = 0;

export function beginAppActivity() {
  activeCount += 1; notify(); let ended = false;
  return () => { if (ended) return; ended = true; activeCount = Math.max(0, activeCount - 1); notify(); };
}
export function isAppActive() { return activeCount > 0; }
function notify() { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("positivxr:activity", { detail: { active: activeCount > 0 } })); }
