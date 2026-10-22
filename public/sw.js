// Element Happenings service worker — Web Push only (2026-07-14). No offline/asset
// caching yet; this exists purely so push notifications and the home-screen
// app badge work when the app itself isn't open.

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()))

self.addEventListener("push", event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (_) {}
  const title = data.title || "Element Happenings"
  const body = data.body || "You have a new notification"
  const url = data.url || "/home"

  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body,
      icon: "/favicon-192x192.png",
      badge: "/favicon-192x192.png",
      data: { url },
    })
    // Badge count = the member's real unread count, sent by the server with
    // each push (2026-10-22). The app itself keeps it in step while open
    // (lib/appBadge.js), so reading alerts in the app now lowers/clears it.
    // Fallback for an older payload: count of notifications on screen.
    // Silently no-ops where the Badging API isn't supported (e.g. Android,
    // which shows its own automatic dot instead).
    if ("setAppBadge" in navigator) {
      try {
        let n = Number.isInteger(data.badge) ? data.badge : (await self.registration.getNotifications()).length
        if (n > 0) await navigator.setAppBadge(n)
        else if ("clearAppBadge" in navigator) await navigator.clearAppBadge()
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
