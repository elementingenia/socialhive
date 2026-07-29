// The Supabase Auth email for a member.
//
// HISTORY / WHY THIS EXISTS (2026-07-29). Every auth path used to build this
// value from the username:
//     `${username}@thesocialhive.internal`
// which quietly made `username` immutable: rename someone and the derived
// email stopped matching their Auth user, so they could no longer log in.
// That left 14 live accounts stuck with names that don't follow the agreed
// FirstName+LastInitial scheme, 5 of them holding real bookings (and
// bookings.member_id is ON DELETE CASCADE, so delete-and-recreate would have
// destroyed 28 bookings).
//
// Now the email is stored on the row (members.auth_email, migration 066) and
// is opaque: nothing derives it, nothing regenerates it, and renaming a member
// does not touch it.
//
// NEVER reintroduce a `<something>@thesocialhive.internal` template built from
// user-editable data. If you need an email for a NEW account, call
// newAuthEmail() -- it is random and permanent.

const DOMAIN = "thesocialhive.internal"

// A fresh, permanent Auth email for a brand-new account. Random rather than
// derived from anything the user can later change.
export function newAuthEmail() {
  const uuid = (globalThis.crypto?.randomUUID?.() ||
    // Node <19 / any runtime without webcrypto on globalThis
    // eslint-disable-next-line no-undef
    require("crypto").randomUUID())
  return `${uuid}@${DOMAIN}`
}

// The email to authenticate an EXISTING member with.
//
// The fallback covers rows written before migration 066 backfilled them (and
// any row where the backfill was somehow skipped): it reproduces exactly the
// old derived value, so such a member can still log in and gets healed by
// ensureAuthEmail below. It is a compatibility shim, not a pattern to copy.
export function authEmailFor(member) {
  if (member?.auth_email) return member.auth_email
  if (member?.username) return `${member.username.toLowerCase()}@${DOMAIN}`
  return null
}

// Persist a legacy-derived email onto the row the first time we see it, so the
// derivation is used once and never again for that member.
export async function ensureAuthEmail(supa, member) {
  const email = authEmailFor(member)
  if (email && !member.auth_email) {
    await supa.from("members").update({ auth_email: email }).eq("id", member.id)
  }
  return email
}

export const AUTH_EMAIL_DOMAIN = DOMAIN
