import { stopManifestSchema, type StopManifest } from "@/lib/content/schemas";
import { assertVaoBinding, getVaoRealizationUrl } from "@/lib/vao/release";
import { fetchVerifiedVaoBytes } from "@/lib/vao/integrity";

export async function fetchStopManifest(realizationId: string, signal?: AbortSignal): Promise<StopManifest> {
  assertVaoBinding(realizationId, { mediaType: "application/json" });
  const bytes = await fetchVerifiedVaoBytes(realizationId, signal);
  const manifest = stopManifestSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  for (const note of manifest.notes) {
    assertVaoBinding(note.realizations.opus, { url: note.opusUrl, byteSize: note.bytes.opus, sha256: note.checksum.opus, mediaType: "audio/ogg" });
    assertVaoBinding(note.realizations.aac, { url: note.aacUrl, byteSize: note.bytes.aac, sha256: note.checksum.aac, mediaType: "audio/mp4" });
    note.opusUrl = getVaoRealizationUrl(note.realizations.opus);
    note.aacUrl = getVaoRealizationUrl(note.realizations.aac);
  }
  return manifest;
}
