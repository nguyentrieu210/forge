const CACHE = "alumdoor-warehouse-v2";
const APP_SHELL = [
  "/mobile/warehouse/",
  "/mobile/warehouse/manifest.webmanifest",
  "/mobile/warehouse/alumdoor-mark.svg",
  "/mobile/warehouse/alumdoor-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // API/auth luôn đi mạng. Cache response nghiệp vụ có thể làm lộ dữ liệu của phiên trước.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/method/")) return;

  if (request.mode === "navigate" && url.pathname.startsWith("/mobile/warehouse")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("/mobile/warehouse/", copy));
          return response;
        })
        .catch(() => caches.match("/mobile/warehouse/")),
    );
    return;
  }

  if (url.pathname.startsWith("/mobile/warehouse/")) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
    );
  }
});
