// Social Hive service worker — Web Push only (2026-07-14). No offline/asset
// caching yet; this exists purely so push notifications and the home-screen
// app badge work when the app itself isn't open.

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()))

self.addEventListener("push", event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (_) {}
  const title = data.title || "The Social Hive"
  const body = data.body || "You have a new notification"
  const url = data.url || "/home"

  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body,
      icon: "/favicon-192x192.png",
      badge: "/favicon-192x192.png",
      data: { url },
    })
    // Badge count = number of not-yet-actioned OS notifications. Silently
    // no-ops on browsers/platforms that don't support the Badging API
    // (e.g. Android, which shows its own automatic dot instead).
    if ("setAppBadge" in navigator) {
      try {
        const shown = await self.registration.getNotifications()
        await navigator.setAppBadge(shown.length)
      } catch (_) {}
    }
  })())
})

self.addEventListener("notificationclick", event => {
  event.notification.close()
  const url = event.notification.data?.url || "/home"
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
    for (const client of allClients) {
      if ("focus" in client) return client.focus()
    }
    if (self.clients.openWindow) return self.clients.openWindow(url)
  })())
})
