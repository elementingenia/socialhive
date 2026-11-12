// "Has this resident ever signed in?" -- one definition for the whole app.
//
// Bug fixed 2026-11-12 (Iain: Sue and John Watson, added the day before,
// showed as "Signed in" in Admin › Residents › Sign-in Help before either
// could have). The old test was members.auth_id, i.e. "has a login". That was
// only true for accounts whose Auth user is made at first sign-in
// (api/auth/login). Admin's Create Login (api/admin/accounts create_account)
// makes the Auth user straight away, so those residents counted as signed in
// from the moment they were added. Confirmed live: 5 active residents had an
// auth_id and no sign-in on record.
//
// The truth is Supabase Auth's own last_sign_in_at, which only moves on a
// real sign-in. Never use auth_id (or last_active_at, which the 2026-10-09
// BUG-086 fix stamped for everyone with an auth_id) to mean "signed in".

const PER_PAGE = 1000
const MAX_PAGES = 20

/** Pure: has this member row signed in, given the Set from fetchSignedInAuthIds? */
export function hasSignedIn(member, signedInAuthIds) {
  return !!member?.auth_id && !!signedInAuthIds && signedInAuthIds.has(member.auth_id)
}

/** Pure: Auth users -> Set of the ids that have a sign-in on record. */
export function signedInIdsFromAuthUsers(users) {
  return new Set((users || []).filter(u => u && u.id && u.last_sign_in_at).map(u => u.id))
}

/**
 * Server only (service-role client). Returns a Set of Auth user ids that have
 * signed in at least once, or null if Supabase Auth could not be read -- the
 * caller decides what to do, never a silent "nobody has signed in".
 */
export async function fetchSignedInAuthIds(supabaseAdmin) {
  const users = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) { console.error("signedIn: listUsers failed", error.message); return null }
    const batch = data?.users || []
    users.push(...batch)
    if (batch.length < PER_PAGE) return signedInIdsFromAuthUsers(users)
  }
  console.error("signedIn: more Auth users than expected, stopped at", users.length)
  return null
}
