const CACHE = "alumdoor-warehouse-v5";
const APP_SHELL = [
  "/mobile/warehouse/",
  "/mobile/warehouse/manifest.webmanifest",
  "/mobile/warehouse/alumdoor-app-192.png",
  "/mobile/warehouse/alumdoor-app-512.png",
  "/mobile/warehouse/alumdoor-app-maskable-512.png",
  "/mobile/warehouse/alumdoor-logo.png",
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
          // Chỉ một HTML shell thành công mới được làm bản khởi động offline. Trước đây
          // phản hồi JSON 401/403 của route in/API cũng có thể ghi đè shell, khiến lần mở
          // PWA sau hiện thẳng AUTHENTICATION_REQUIRED thay vì màn đăng nhập.
          const contentType = response.headers.get("content-type") ?? "";
          if (response.ok && contentType.includes("text/html")) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("/mobile/warehouse/", copy));
          }
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
