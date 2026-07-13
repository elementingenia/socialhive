import { supabase } from "@/lib/supabase"

// Returns a valid, non-expired access token -- forcing a refresh first if the
// cached session is expired or about to expire.
//
// Why this exists: supabase-js's background auto-refresh timer only fires
// while the page's JS is actually running. Mobile Safari freezes JS timers
// on a backgrounded/locked tab, so a session left open for a while (very
// common on iPhone) can sit with a dead access token until the tab is
// reopened. A plain `supabase.auth.getSession()` just hands back that stale
// token synchronously -- the API then correctly rejects it as
// "Unauthenticated" with no recovery, which is exactly what surfaced on
// Coordinator View on 2026-07-14. Checking expiry and refreshing first closes
// that gap.
export async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const nowSec = Date.now() / 1000
  const isExpiringSoon = !session.expires_at || session.expires_at - nowSec < 60

  if (isExpiringSoon) {
    const { data: refreshed, error } = await supabase.auth.refreshSession()
    if (!error && refreshed?.session) return refreshed.session.access_token
    // Refresh failed (e.g. refresh token itself is dead) -- fall through and
    // use whatever we have rather than throwing; the caller's existing
    // "Unauthenticated" handling still applies as a last resort.
  }
  return session.access_token
}
