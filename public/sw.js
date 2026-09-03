const SHELL_VERSION = "positivxr-shell-v13";
const RUNTIME_VERSION = "positivxr-runtime-v13";
const PACK_CACHE = "positivxr-stop-packs-v1";
const SHELL = [
  "/",
  "/ar",
  "/ar/quest",
  "/play",
  "/standard",
  "/view",
  "/offline-fallback",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/vao/current.json",
  "/vao/releases/0.5.0-2/vao-manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_VERSION).then((cache) => cache.addAll(SHELL)).then(() => { if (!self.registration.active) return self.skipWaiting(); }));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => (key.startsWith("positivxr-shell-") && key !== SHELL_VERSION) || (key.startsWith("positivxr-runtime-") && key !== RUNTIME_VERSION)).map((key) => caches.delete(key)))),
    self.registration.navigationPreload?.enable(),
  ]).then(() => self.clients.claim()));
});
self.addEventListener("message", (event) => { if (event.data?.type === "SKIP_WAITING") self.skipWaiting(); });

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url); if (url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = (await event.preloadResponse) || await fetch(event.request);
        if (response.ok) void caches.open(RUNTIME_VERSION).then((cache) => cache.put(event.request, response.clone()));
        return response;
      } catch {
        return (await caches.match(event.request)) || (await caches.match(url.pathname)) || (await caches.match("/offline-fallback")) || Response.error();
      }
    })());
    return;
  }
  if (url.pathname.startsWith("/vao/releases/0.5.0-2/workspace/payload/media/audio/stops/")) {
    event.respondWith(caches.open(PACK_CACHE).then(async (cache) => (await cache.match(event.request)) || fetch(event.request)));
    return;
  }
  if (url.pathname.startsWith("/vao/releases/0.5.0-2/workspace/payload/media/models/") || url.pathname.startsWith("/vao/releases/0.5.0-2/workspace/payload/media/audio/room/") || url.pathname.startsWith("/vao/releases/0.5.0-2/workspace/payload/media/images/room-plan") || url.pathname.startsWith("/media/models/") || url.pathname.startsWith("/media/reports/") || url.pathname.startsWith("/draco/gltf/")) {
    if (event.request.headers.has("range")) { event.respondWith(fetch(event.request)); return; }
    event.respondWith(caches.open(RUNTIME_VERSION).then(async (cache) => {
      const hit = await cache.match(event.request); if (hit) return hit;
      try { const response = await fetch(event.request); if (response.status === 200) await cache.put(event.request, response.clone()); return response; }
      catch { return new Response("Media is unavailable offline", { status: 503, headers: { "Content-Type": "text/plain" } }); }
    }));
    return;
  }

  if (["script", "style", "font", "image"].includes(event.request.destination) || /\.(?:css|js|json|png|jpe?g|svg|webp|woff2?)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_VERSION);
      const cached = await cache.match(event.request);
      const refreshed = fetch(event.request).then(async (response) => {
        if (response.status === 200) await cache.put(event.request, response.clone());
        return response;
      }).catch(() => undefined);
      return cached || await refreshed || Response.error();
    })());
  }
});
