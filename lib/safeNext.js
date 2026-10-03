// lib/safeNext.js -- "return to where you were" after sign-in.
//
// Iain, 2026-10-03: a resident following a shared event link while logged out
// saw the right event (read-only, on /cal), tapped Sign In, and after signing
// in landed on /home -- the event was lost. Root cause: every route to /login
// dropped where the visitor came from, and the login page always sent people
// to /home. These helpers carry a `next` path through /login and back.
//
// Only same-site paths are accepted. Anything else (a full URL, a
// protocol-relative "//evil.com", a backslash trick, the login page itself)
// is rejected and the caller falls back to /home -- otherwise a crafted
// /login?next=... link could send a resident to another site after they
// typed their PIN.

export const DEFAULT_AFTER_LOGIN = '/home'

/**
 * Return `raw` if it is a safe same-site path, otherwise null.
 * Safe = starts with a single "/", no "//" or "/\" prefix, no control
 * characters, not /login (avoids a loop).
 */
export function safeNextPath(raw) {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s || s.length > 500) return null
  if (s[0] !== '/') return null
  if (s[1] === '/' || s[1] === '\\') return null
  if (s.includes('\\')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(s)) return null
  const pathOnly = s.split(/[?#]/)[0]
  if (pathOnly === '/login' || pathOnly.startsWith('/login/')) return null
  return s
}

/** Where to go after a successful sign-in. */
export function afterLoginPath(raw) {
  return safeNextPath(raw) || DEFAULT_AFTER_LOGIN
}

/**
 * Build a /login href that returns to `next` afterwards. `extra` adds other
 * query params (e.g. { register: '1' }). An unsafe or empty `next` is simply
 * left off.
 */
export function loginHref(next, extra = {}) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(extra)) {
    if (v != null && v !== '') params.set(k, String(v))
  }
  const safe = safeNextPath(next)
  if (safe && safe !== DEFAULT_AFTER_LOGIN) params.set('next', safe)
  const qs = params.toString()
  return qs ? `/login?${qs}` : '/login'
}
