// Home-screen app badge sync (2026-10-22, BUG-097).
//
// The phone's app badge (iPhone home-screen number on the installed app) used
// to be set only by the service worker when a push arrived, and nothing ever
// lowered it -- reading or ticking alerts in the app changed the bell but not
// the badge, so it only ever went up. The app now pushes its own unread count
// to the badge every time the bell count is refreshed, and clears the badge
// (plus any of our alerts still sitting in the notification centre) at zero.

// Pure: normalise whatever count we have into a badge value (0 = clear).
export function badgeValue(count) {
  const n = Math.floor(Number(count))
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Best-effort. Silently does nothing where the Badging API isn't supported.
export async function syncAppBadge(count) {
  if (typeof navigator === "undefined") return
  const n = badgeValue(count)
  try {
    if (n > 0) {
      if ("setAppBadge" in navigator) await navigator.setAppBadge(n)
      return
    }
    if ("clearAppBadge" in navigator) await navigator.clearAppBadge()
    // Nothing left unread: tidy away our alerts still in the notification
    // centre so they don't pile up there either.
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      const shown = reg ? await reg.getNotifications() : []
      shown.forEach(nt => nt.close())
    }
  } catch (_) {}
}
