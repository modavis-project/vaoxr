import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const configuredRoot = process.env.VAOXR_STANDALONE_ROOT;
const standaloneRoot = configuredRoot
  ? resolve(configuredRoot)
  : existsSync(join(scriptDirectory, "dist/server/index.js"))
    ? scriptDirectory
    : resolve(scriptDirectory, "../dist/standalone");
const vinextServerDirectory = join(standaloneRoot, "node_modules/vinext/dist/server");

// Vinext's built-in static MIME table is intentionally small. Register the
// VAO and XR delivery formats before its startup cache inventories public files.
const { CONTENT_TYPES, StaticFileCache } = await import(pathToFileURL(join(vinextServerDirectory, "static-file-cache.js")).href);
Object.assign(CONTENT_TYPES, {
  ".glb": "model/gltf-binary",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".opus": "audio/ogg",
  ".usdz": "model/vnd.usdz+zip",
  ".vao": "application/vnd.modavis.vao+zip",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
});

// Assign immutable-cache defaults to versioned VAO files at startup.
// Route-level headers in next.config.ts also cover Worker deployments.
const createStaticFileCache = StaticFileCache.create.bind(StaticFileCache);
StaticFileCache.create = async (clientDirectory) => {
  const cache = await createStaticFileCache(clientDirectory);
  for (const [pathname, entry] of cache.entries) {
    if (!pathname.startsWith("/vao/")) continue;
    const cacheControl = pathname.startsWith("/vao/releases/")
      ? "public, max-age=31536000, immutable"
      : "public, max-age=300";
    Object.assign(entry.notModifiedHeaders, {
      "Cache-Control": cacheControl,
    });
    for (const variant of [entry.original, entry.br, entry.gz, entry.zst]) {
      if (!variant) continue;
      Object.assign(variant.headers, {
        "Cache-Control": cacheControl,
      });
    }
  }
  return cache;
};

const { startProdServer } = await import(pathToFileURL(join(vinextServerDirectory, "prod-server.js")).href);
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";

await startProdServer({
  port,
  host,
  outDir: join(standaloneRoot, "dist"),
}).catch((error) => {
  console.error("[vaoXR] Failed to start production server");
  console.error(error);
  process.exit(1);
});
