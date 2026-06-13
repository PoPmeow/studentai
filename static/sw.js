/* Student AI service worker — installable PWA + offline shell */
const CACHE = "studentai-v3";
const SHELL = ["/", "/static/style.css", "/static/app.js", "/static/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;                  // POST/PATCH/DELETE → network
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;          // live data → network only

  // HTML/navigation → network-first so deploys show up, fall back to cached shell
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request).then((r) => {
        caches.open(CACHE).then((c) => c.put("/", r.clone()));
        return r;
      }).catch(() => caches.match("/"))
    );
    return;
  }

  // static assets → stale-while-revalidate
  e.respondWith(
    caches.match(request).then((cached) => {
      const live = fetch(request).then((r) => {
        if (r.ok) caches.open(CACHE).then((c) => c.put(request, r.clone()));
        return r;
      }).catch(() => cached);
      return cached || live;
    })
  );
});
