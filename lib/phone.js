// ── Shared phone-number input mask ────────────────────────────────────────
// Standard 2026-08-05: every phone field in the app must store/display as
// NNNN NNN NNN (4-3-3, space-separated) — no exceptions, no free-form entry.
// The keypad Australian mobile numbers are entered on has no space key, so
// the UI has to insert the spaces itself as the resident/admin types, rather
// than relying on them to type it correctly (they can't) or reformatting
// only on blur (which looks broken while typing).
//
// formatPhoneInput() is a live mask: call it from onChange with the input's
// current raw value, and set the input's value to the result. It strips
// everything but digits, caps at 10 (the length of an AU mobile without the
// country code, e.g. 0434 357 060), and re-inserts the 4-3-3 spacing on
// every keystroke — so it self-corrects on paste and backspace too, not
// just forward typing.
export function formatPhoneInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 10)
  const parts = [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 10)].filter(Boolean)
  return parts.join(' ')
}

// ── Tap to call / message (Iain, 2026-10-03) ─────────────────────────────
// Links for the Call and Message buttons on Info > Contacts and Info >
// Interests. Stored numbers carry spaces ("0434 357 060"); tel:/sms: links
// should be digits only (a leading + kept for international numbers) so
// every phone dials them reliably.
export function phoneDigits(phone) {
  const s = String(phone || '').trim()
  if (!s) return ''
  const digits = s.replace(/\D/g, '')
  return s.startsWith('+') && digits ? `+${digits}` : digits
}

export function telHref(phone) {
  const d = phoneDigits(phone)
  return d ? `tel:${d}` : null
}

// Only Australian mobiles can receive a text -- a landline "Message" button
// would just fail, so it isn't offered. 04xxxxxxxx, or +614 / 614 forms.
export function isMobileNumber(phone) {
  const d = phoneDigits(phone).replace(/^\+/, '')
  return /^04\d{8}$/.test(d) || /^614\d{8}$/.test(d)
}

export function smsHref(phone) {
  return isMobileNumber(phone) ? `sms:${phoneDigits(phone)}` : null
}
