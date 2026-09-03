import { getVaoRealization, getVaoRealizationByUrl, getVaoRealizationUrl } from "./release";

const maximumMaterializationBytes = 128 * 1024 * 1024;

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function verifyVaoBytes(realizationId: string, bytes: ArrayBuffer): Promise<void> {
  const realization = getVaoRealization(realizationId);
  if (realization.byteSize > maximumMaterializationBytes) throw new Error(`VAO realization exceeds the local materialization limit: ${realizationId}`);
  if (bytes.byteLength !== realization.byteSize) throw new Error(`VAO byte-size verification failed: ${realizationId}`);
  const digest = toHex(await crypto.subtle.digest("SHA-256", bytes));
  if (digest !== realization.sha256) throw new Error(`VAO SHA-256 verification failed: ${realizationId}`);
}

export async function fetchVerifiedVaoBytes(realizationId: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const realization = getVaoRealization(realizationId);
  if (realization.byteSize > maximumMaterializationBytes) throw new Error(`VAO realization exceeds the local materialization limit: ${realizationId}`);
  const response = await fetch(getVaoRealizationUrl(realizationId), { signal });
  if (!response.ok) throw new Error(`VAO materialization failed with ${response.status}: ${realizationId}`);
  const bytes = await response.arrayBuffer();
  await verifyVaoBytes(realizationId, bytes);
  return bytes;
}

export async function fetchVerifiedVaoResponse(realizationId: string, signal?: AbortSignal): Promise<Response> {
  const realization = getVaoRealization(realizationId);
  const bytes = await fetchVerifiedVaoBytes(realizationId, signal);
  return new Response(bytes, { status: 200, headers: { "Content-Type": realization.mediaType, "Content-Length": String(realization.byteSize), "X-VAO-SHA256": realization.sha256 } });
}

export async function fetchVerifiedVaoUrl(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  return fetchVerifiedVaoBytes(getVaoRealizationByUrl(url).id, signal);
}
