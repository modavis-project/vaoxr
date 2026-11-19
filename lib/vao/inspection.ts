import { BlobReader, ZipReader } from "@zip.js/zip.js";
import type { FileEntry } from "@zip.js/zip.js";
import { z } from "zod";
import { sha256Hex } from "./sha256";

const format = z.enum(["0.5.0", "0.6.0"]);
const profile = z.object({ id: z.url(), version: format, specificationVersion: z.string().optional() });
const manifestSchema = z.object({
  type: z.literal("VirtualAcousticObject"),
  formatVersion: format,
  $schema: z.string(),
  "@context": z.tuple([z.string()]).rest(z.unknown()),
  id: z.url(),
  title: z.record(z.string(), z.string()),
  release: z.object({ id: z.url(), contentVersion: z.string() }),
  conformsTo: z.array(z.url()),
  profiles: z.array(profile),
  materializableProfiles: z.array(profile),
  logicalAssets: z.array(z.unknown()),
  realizations: z.array(z.object({
    id: z.url(),
    byteSize: z.number().int().nonnegative(),
    mediaType: z.string(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })),
});
const carrierSchema = z.object({
  type: z.literal("VAOCarrier"),
  id: z.url(),
  releaseId: z.url(),
  formatVersion: format,
  $schema: z.string(),
  manifestByteSize: z.number().int().positive(),
  manifestSHA256: z.string().regex(/^[a-f0-9]{64}$/),
  carrierMode: z.enum(["bootstrap", "preservation-closure", "custom"]),
  embeddedRealizations: z.array(z.object({ realizationId: z.url(), path: z.string() })),
});

const decoder = new TextDecoder("utf-8", { fatal: true });
const namespace = "https://w3id.org/modavis/vao";
const mmicProfile = namespace + "/profile/mmic/1.0.0";
const manifestName = "vao-manifest.json";
const carrierName = "META-INF/vao-carrier.json";
const mimetype = "application/vnd.modavis.vao+zip";
const archiveLimit = 32 * 1024 * 1024;
const documentLimit = 4 * 1024 * 1024;
const audioLimit = 8 * 1024 * 1024;
const audioTypes = new Set(["audio/wav", "audio/mpeg", "audio/ogg", "audio/mp4"]);
type Manifest = z.infer<typeof manifestSchema>;
type Carrier = z.infer<typeof carrierSchema>;

export type VaoInspection = {
  manifest: Manifest;
  carrier?: Carrier;
  audio?: Blob;
};

async function readMember(entry: FileEntry, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > limit) {
    throw new Error("A requested carrier member exceeds the inspection limit.");
  }
  if (entry.encrypted || (entry.compressionMethod !== 0 && entry.compressionMethod !== 8)) {
    throw new Error("The carrier member must use stored or deflated ZIP encoding without encryption.");
  }
  const bytes = new Uint8Array(entry.uncompressedSize);
  let offset = 0;
  await entry.getData(new WritableStream<Uint8Array>({
    write(chunk) {
      if (offset + chunk.byteLength > bytes.byteLength) {
        throw new Error("A carrier member expanded beyond its recorded size.");
      }
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    },
  }), { checkSignature: true, useWebWorkers: false });
  if (offset !== bytes.byteLength) throw new Error("The carrier member size is incorrect.");
  return bytes;
}

function readManifest(bytes: Uint8Array): Manifest {
  const result = manifestSchema.safeParse(JSON.parse(decoder.decode(bytes)));
  if (!result.success) throw new Error("Choose a VAO 0.5.0 or 0.6.0 manifest.");
  const manifest = result.data;
  const version = manifest.formatVersion;
  const releaseBase = namespace + "/" + version;
  const core = namespace + "/profile/core/" + version;
  const declarations = [...manifest.profiles, ...manifest.materializableProfiles];
  if (
    manifest.$schema !== releaseBase + "/schema/manifest.json"
    || manifest["@context"][0] !== releaseBase + "/context.jsonld"
    || !manifest.conformsTo.includes(core)
    || !manifest.profiles.some((entry) => entry.id === core)
    || declarations.some((entry) => entry.version !== version)
    || new Set(declarations.map((entry) => entry.id)).size !== declarations.length
  ) throw new Error("The schema, context or profile versions disagree with the VAO format.");

  const mmic = declarations.filter((entry) => entry.id === mmicProfile);
  if (mmic.length !== Number(manifest.conformsTo.includes(mmicProfile))
      || mmic.some((entry) => version !== "0.6.0" || entry.specificationVersion !== "1.0.0")) {
    throw new Error("The manifest does not declare a consistent MMIC 1.0.0 profile.");
  }
  return manifest;
}

async function inspectCarrier(file: File): Promise<VaoInspection> {
  const reader = new ZipReader(new BlobReader(file));
  try {
    const entries = new Map<string, FileEntry>();
    let count = 0;
    for await (const entry of reader.getEntriesGenerator()) {
      if (++count > 20_000) throw new Error("The carrier has too many ZIP entries.");
      if (entry.directory) continue;
      if (entries.has(entry.filename)) throw new Error("The carrier contains a duplicate ZIP entry.");
      entries.set(entry.filename, entry);
    }
    const marker = entries.get("mimetype");
    const manifestEntry = entries.get(manifestName);
    const descriptorEntry = entries.get(carrierName);
    if (!marker || !manifestEntry || !descriptorEntry
        || marker.compressionMethod !== 0 || decoder.decode(await readMember(marker, 64)) !== mimetype) {
      throw new Error("The carrier is missing a VAO declaration, manifest or descriptor.");
    }
    const bytes = await readMember(manifestEntry, documentLimit);
    const carrier = carrierSchema.parse(JSON.parse(decoder.decode(await readMember(descriptorEntry, documentLimit))));
    if (carrier.manifestByteSize !== bytes.byteLength || carrier.manifestSHA256 !== await sha256Hex(bytes.buffer)) {
      throw new Error("The carrier manifest does not match its recorded size and SHA-256.");
    }
    const manifest = readManifest(bytes);
    if (carrier.formatVersion !== manifest.formatVersion
        || carrier.$schema !== namespace + "/" + manifest.formatVersion + "/schema/carrier.json") {
      throw new Error("The carrier and manifest declare different VAO versions.");
    }
    if (carrier.releaseId !== manifest.release.id) {
      throw new Error("The carrier and manifest name different releases.");
    }

    const embedded = new Map(carrier.embeddedRealizations.map((entry) => [entry.realizationId, entry]));
    if (embedded.size !== carrier.embeddedRealizations.length) {
      throw new Error("The carrier lists a realization more than once.");
    }
    const audio = manifest.realizations.find((item) => audioTypes.has(item.mediaType)
      && item.byteSize > 0 && item.byteSize <= audioLimit && embedded.has(item.id));
    if (!audio) return { manifest, carrier };
    const path = embedded.get(audio.id)?.path;
    if (!path?.startsWith("payload/") || path.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error("The selected audio preview has an invalid carrier path.");
    }
    const audioEntry = entries.get(path);
    if (!audioEntry || audioEntry.uncompressedSize !== audio.byteSize) {
      throw new Error("The embedded audio does not match its recorded size.");
    }
    const audioBytes = await readMember(audioEntry, audioLimit);
    if (await sha256Hex(audioBytes.buffer) !== audio.sha256) {
      throw new Error("The embedded audio does not match its recorded SHA-256.");
    }
    return { manifest, carrier, audio: new Blob([audioBytes], { type: audio.mediaType }) };
  } finally {
    await reader.close();
  }
}

export async function inspectVao(file: File): Promise<VaoInspection> {
  const archive = file.name.toLowerCase().endsWith(".vao");
  if (file.size > (archive ? archiveLimit : documentLimit)) {
    throw new Error(archive ? "Choose a carrier of 32 MiB or less." : "Choose a manifest of 4 MiB or less.");
  }
  if (archive) return inspectCarrier(file);
  return { manifest: readManifest(new Uint8Array(await file.arrayBuffer())) };
}
