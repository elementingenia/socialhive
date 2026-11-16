import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { newAuthEmail } from "@/lib/authEmail"
import { newPinColumns } from "@/lib/pinAuth"
import { sydneyTodayStr } from "@/lib/date"

// Creates a login: a Supabase Auth user plus the members row. Shared by
// Admin's Create Login (app/api/admin/accounts) and Add Resident
// (app/api/residents/add) so the two can never make an account differently.
// Server only. Returns { member_id } or { error, status }.
//
// The Auth email is random and permanent (migration 066), never derived from
// the username. Admin/committee created: must_change_pin is set, because the
// starting password is handed over.

const toAuthPassword = (pin) => pin + "_hive"

export async function createMemberAccount({ name, displayName, username, pin, fields = {} }) {
  const { data: existing } = await supabaseAdmin
    .from("members").select("id").ilike("username", username).maybeSingle()
  if (existing) return { error: "That username is already taken.", status: 409 }

  const fakeEmail = newAuthEmail()
  const authPassword = toAuthPassword(pin)

  // Create the Auth user (relinking a dangling orphan if the email already
  // exists from a previously-deleted members row -- same recovery as register).
  let authUserId = null
  let relinkedOrphan = false
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: fakeEmail, password: authPassword, email_confirm: true,
    user_metadata: { username },
  })
  if (createErr) {
    const emailTaken = /already been registered|already exists/i.test(createErr.message || "")
    if (!emailTaken) return { error: "Could not create the login. Please try again.", status: 500 }
    const lookup = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(fakeEmail)}`,
      { cache: "no-store", headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } }
    )
    const orphan = (lookup.ok ? await lookup.json() : null)?.users?.find(u => u.email === fakeEmail)
    if (!orphan) return { error: "Could not create the login. Please try again.", status: 500 }
    const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(orphan.id, { password: authPassword, user_metadata: { username } })
    if (upErr) return { error: "Could not create the login. Please try again.", status: 500 }
    authUserId = orphan.id
    relinkedOrphan = true
  } else {
    authUserId = created.user.id
  }

  const { data: member, error: insertErr } = await supabaseAdmin.from("members").insert({
    ...fields,
    name, display_name: displayName || name, username, ...newPinColumns(pin),
    auth_id: authUserId, auth_email: fakeEmail,
    must_change_pin: true,
    is_admin: false, status: "active",
    joined_date: sydneyTodayStr(),
  }).select("id").single()

  if (insertErr) {
    if (!relinkedOrphan) await supabaseAdmin.auth.admin.deleteUser(authUserId)
    const dup = /duplicate|unique/i.test(insertErr.message || "")
    return { error: dup ? "That username is already taken." : "Could not create the account. Please try again.", status: dup ? 409 : 500 }
  }
  return { member_id: member.id, auth_id: authUserId }
}
