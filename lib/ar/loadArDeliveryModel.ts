import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { AR_DELIVERY_MODEL_PATH, AR_DELIVERY_MODEL_URL, AR_DELIVERY_REPORT_URL } from "@/lib/ar/deliveryModel";

interface ArDeliveryReport {
  derivative: {
    path: string;
    sha256: string;
  };
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function loadArDeliveryAsset(onProgress?: (percent: number) => void) {
  const [reportResponse, modelResponse] = await Promise.all([
    fetch(AR_DELIVERY_REPORT_URL, { cache: "no-cache" }),
    fetch(AR_DELIVERY_MODEL_URL),
  ]);
  if (!reportResponse.ok) throw new Error(`AR model report unavailable (${reportResponse.status})`);
  if (!modelResponse.ok) throw new Error(`AR model unavailable (${modelResponse.status})`);

  const [report, bytes] = await Promise.all([
    reportResponse.json() as Promise<ArDeliveryReport>,
    modelResponse.arrayBuffer(),
  ]);
  if (report.derivative.path !== AR_DELIVERY_MODEL_PATH) throw new Error("AR model report path mismatch");
  const actualHash = toHex(await crypto.subtle.digest("SHA-256", bytes));
  if (actualHash !== report.derivative.sha256) throw new Error("AR delivery model integrity check failed");
  onProgress?.(100);

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("/draco/gltf/");
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  try {
    const gltf = await loader.parseAsync(bytes, "/media/models/");
    return { scene: gltf.scene, animations: gltf.animations };
  } finally {
    dracoLoader.dispose();
  }
}
