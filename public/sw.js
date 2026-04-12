// Service worker for Sally's Bar staff PWA
const CACHE = "sallys-staff-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-only — we only need the SW for push, not offline caching.
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: event.data?.text() ?? "Sally's Bar" }; }

  const title = data.title || "Sally's Bar";
  const options = {
    body: data.body || "",
    icon: data.icon || "/favicon/web-app-manifest-192x192.png",
    badge: data.badge || "/favicon/web-app-manifest-192x192.png",
    tag: data.tag || "sallys-order",
    renotify: true,
    data: { url: data.url || "/staff" },
    vibrate: [120, 60, 120],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/staff";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes("/staff") && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
