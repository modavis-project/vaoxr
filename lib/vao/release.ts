import { z } from "zod";
import releaseIndexJson from "@/content/vao-index.json";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const rootPathSchema = z.string().startsWith("/");
const realizationSchema = z.object({
  path: z.string().startsWith("payload/").refine((value) => !value.split("/").includes(".."), "Unsafe carrier path"),
  byteSize: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sha256: sha256Schema,
  mediaType: z.string().regex(/^[^/\s]+\/[^\s]+$/),
});

const releaseIndexSchema = z.object({
  formatVersion: z.literal("0.5.0"),
  vaoId: z.url(),
  releaseId: z.url(),
  contentVersion: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  profiles: z.array(z.url()).min(2),
  releaseBaseUrl: rootPathSchema,
  workspaceBaseUrl: rootPathSchema,
  manifest: z.object({ url: rootPathSchema, byteSize: z.number().int().positive(), sha256: sha256Schema }),
  releaseDescriptor: rootPathSchema,
  conformance: rootPathSchema,
  carriers: z.object({
    bootstrap: z.object({ id: z.url(), url: rootPathSchema }),
    preservationClosure: z.object({ id: z.url(), url: rootPathSchema }),
  }),
  realizations: z.record(z.string().min(1), realizationSchema),
});

export const vaoRelease = releaseIndexSchema.parse(releaseIndexJson);
type VaoRealization = z.infer<typeof realizationSchema> & { id: string };

export function getVaoRealization(id: string): VaoRealization {
  const realization = vaoRelease.realizations[id];
  if (!realization) throw new Error(`Unknown VAO realization: ${id}`);
  return { id, ...realization };
}

export function getVaoRealizationUrl(id: string): string {
  return `${vaoRelease.workspaceBaseUrl}${getVaoRealization(id).path}`;
}

export function getVaoRealizationByUrl(url: string): VaoRealization {
  if (!url.startsWith(vaoRelease.workspaceBaseUrl)) throw new Error(`URL is outside the VAO workspace: ${url}`);
  const path = url.slice(vaoRelease.workspaceBaseUrl.length);
  const entry = Object.entries(vaoRelease.realizations).find(([, realization]) => realization.path === path);
  if (!entry) throw new Error(`URL does not resolve through the VAO carrier: ${url}`);
  return { id: entry[0], ...entry[1] };
}

export function assertVaoBinding(id: string, expected: { url?: string; byteSize?: number; sha256?: string; mediaType?: string }): VaoRealization {
  const realization = getVaoRealization(id);
  if (expected.url !== undefined && expected.url !== getVaoRealizationUrl(id)) throw new Error(`VAO URL mismatch for ${id}`);
  if (expected.byteSize !== undefined && expected.byteSize !== realization.byteSize) throw new Error(`VAO byte-size mismatch for ${id}`);
  if (expected.sha256 !== undefined && expected.sha256 !== realization.sha256) throw new Error(`VAO SHA-256 mismatch for ${id}`);
  if (expected.mediaType !== undefined && expected.mediaType !== realization.mediaType) throw new Error(`VAO media-type mismatch for ${id}`);
  return realization;
}
