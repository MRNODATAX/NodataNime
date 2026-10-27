const CACHE_VERSION = "nodatanime-pwa-v6.5";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/css/styles.css?v=6.5",
  "/js/app.js?v=6.5",
  "/assets/favicon.svg",
  "/assets/no-cover.svg",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
  "/assets/apple-touch-icon.png",
  "/assets/qris-nodatashop.jpg",
];

function isAllowedStaticAssetPath(pathname = "") {
  return (
    pathname === "/" ||
    pathname === "/offline.html" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/css/") ||
    pathname.startsWith("/js/") ||
    pathname.startsWith("/assets/")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Jangan pernah men-cache stream video besar maupun endpoint verifikasi QRIS dinamis (/api/support/*)
  if (
    url.pathname.startsWith("/api/anime/stream-proxy") ||
    url.pathname.startsWith("/api/support/") ||
    url.pathname.endsWith(".mp4")
  ) {
    return;
  }

  // Strategi Network-First untuk API publik katalog & komunitas (hanya cache respons JSON valid)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const ct = (response.headers.get("content-type") || "").toLowerCase();
          if (response && response.ok && ct.includes("application/json")) {
            const copy = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(
            JSON.stringify({ ok: false, offline: true, error: "Perangkat sedang offline." }),
            { status: 503, headers: { "Content-Type": "application/json; charset=utf-8" } }
          );
        })
    );
    return;
  }

  // Strategi Navigation SPA: Network-First -> Cached App Shell -> Offline Page
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const ct = (response.headers.get("content-type") || "").toLowerCase();
          if (response && response.ok && ct.includes("text/html")) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(async () => {
          const shell = await caches.match("/");
          if (shell) return shell;
          return caches.match("/offline.html");
        })
    );
    return;
  }

  // Hanya cache path aset statis resmi agar STATIC_CACHE tidak dipenuhi URL acak
  if (!isAllowedStaticAssetPath(url.pathname)) {
    return;
  }

  // Strategi Stale-While-Revalidate untuk aset statis lokal
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
