/* Student AI service worker — installable PWA + offline shell + web push */
const CACHE = "studentai-v8";
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

/* ── Web push ── */
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(data.title || "Student AI", {
    body: data.body || "",
    icon: "/static/icon.svg",
    badge: "/static/icon.svg",
    tag: "studentai-reminder",
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
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
