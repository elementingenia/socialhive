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


// Wraps fetch() with the auth pattern every API route in this app uses:
// attach a Bearer token, and if the server still says 401, it means our
// locally-predicted "should be valid" token (above) was wrong -- something
// invalidated it server-side before its own claimed expiry (a session
// revoked elsewhere, a signing key rotation, anything). Confirmed live
// 2026-07-14: a token with 9 minutes left on its own exp claim was still
// rejected outright by /api/screenings, which the expiry check above can't
// predict since it only looks at local time vs. exp, never asks the server.
// On a 401, force a real refreshSession() (not just the expiry-gated one in
// getAuthToken) and retry exactly once before giving the caller a final,
// possibly-still-401 response to handle normally.
export async function authedFetch(url, options = {}) {
  const attempt = async (token) => fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  })

  let token = await getAuthToken()
  let res = await attempt(token)

  if (res.status === 401) {
    const { data, error } = await supabase.auth.refreshSession()
    if (!error && data?.session?.access_token) {
      res = await attempt(data.session.access_token)
    }

    if (res.status === 401 && typeof window !== "undefined") {
      // Confirmed live 2026-07-14: sometimes the refresh token itself is
      // already dead ("Refresh Token Not Found"), not just the access
      // token -- no amount of retrying recovers that, only a real re-login
      // does. Previously every caller handled a persistent 401 differently
      // (Coordinator View showed an explicit error, Screenings' list
      // silently rendered empty with zero indication anything was wrong).
      // Centralising it here means every screen now gets the same, correct
      // outcome: sent to sign in again with a plain-language reason,
      // instead of either an unexplained error or misleading silence.
      window.location.href = "/login?reason=expired"
    }
  }

  return res
}
