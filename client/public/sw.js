// Service worker do ExpresSpace: push + cache leve dos assets (o HTML sempre vem da rede).
const CACHE = "sede-v14";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k); await self.clients.claim(); })()); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // assets com hash/versão: cache primeiro; resto vai pra rede
  if (/\/assets\/|\/icons\/|\/maps\//.test(url.pathname) && !url.pathname.endsWith(".json")) {
    e.respondWith((async () => { const c = await caches.open(CACHE); const hit = await c.match(e.request); if (hit) return hit; const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; })());
  }
});
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: "ExpresSpace", body: e.data?.text() || "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "ExpresSpace", { body: d.body || "", icon: "/icons/icon-192.png", badge: "/icons/badge-72.png", tag: d.tag, data: { url: d.url || "/" }, renotify: !!d.tag }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/";
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const same = all.find((c) => new URL(c.url).origin === location.origin);
    if (same) { same.focus(); return; }
    await clients.openWindow(url);
  })());
});
