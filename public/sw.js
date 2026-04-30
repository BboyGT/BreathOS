const CACHE_VERSION = "breatheos-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

const APP_SHELL = [
  "/",
  "/manifest.json",
  "/offline.html",
  "/logo.svg",
  "/icons/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Network-only for API routes
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/")) {
    e.respondWith(
      fetch(e.request).catch(() =>
        url.pathname.startsWith("/api/")
          ? new Response(JSON.stringify({ error: "offline" }), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            })
          : caches.match("/offline.html")
      )
    );
    return;
  }

  // Static assets — cache-first
  if (url.pathname.match(/\.(svg|png|jpg|webp|woff2|ico)$/)) {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  // HTML navigation — network-first, fall back to offline page
  if (e.request.headers.get("Accept")?.includes("text/html")) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // Everything else — network-first
  e.respondWith(networkFirst(e.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("Asset unavailable offline", { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(DYNAMIC_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? (await caches.match("/offline.html")) ?? new Response("Offline", { status: 503 });
  }
}
