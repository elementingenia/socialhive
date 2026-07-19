import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { validateNewAccount, validatePin } from "@/lib/accounts"

// Admin-only account management (2026-07-16). Fills two gaps: no way for an
// admin to create a login for a resident who hasn't self-registered (and to
// link it to their existing contact), and no way to reset a forgotten PIN
// (self-service change-password needs the OLD pin). The Auth plumbing mirrors
// app/api/auth/register + app/api/auth/change-password.


const toAuthPassword = (pin) => pin + "_hive"

async function requireAdmin(req) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return null
  const { data: member } = await supabaseAdmin
    .from("members").select("id, is_admin").eq("auth_id", user.id).single()
  return member?.is_admin ? member : null
}

export async function POST(req) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const body = await req.json()
  const action = body.action

  // ── Create a login for a resident ───────────────────────────────────────────
  // Optionally promotes an existing standalone resident contact (contact_id):
  // the new member becomes the account, and the contact row is linked to it
  // (member_id) so its phone/title/categories carry over. Members are implicit
  // Residents, so no separate contacts row is needed when created from scratch.
  if (action === "create_account") {
    const name = (body.name || "").trim()
    const username = (body.username || "").trim()
    const pin = body.pin == null ? "" : String(body.pin)
    const contactId = body.contact_id || null

    const err = validateNewAccount({ name, username, pin })
    if (err) return NextResponse.json({ error: err }, { status: 400 })

    const { data: existing } = await supabaseAdmin
      .from("members").select("id").ilike("username", username).maybeSingle()
    if (existing) return NextResponse.json({ error: "That username is already taken." }, { status: 409 })

    const fakeEmail = `${username.toLowerCase()}@thesocialhive.internal`
    const authPassword = toAuthPassword(pin)

    // Create Auth user (relinking a dangling orphan if the email already
    // exists from a previously-deleted members row — same recovery as register).
    let authUserId = null
    let relinkedOrphan = false
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: fakeEmail, password: authPassword, email_confirm: true,
      user_metadata: { username },
    })
    if (createErr) {
      const emailTaken = /already been registered|already exists/i.test(createErr.message || "")
      if (!emailTaken) return NextResponse.json({ error: "Could not create the login. Please try again." }, { status: 500 })
      const lookup = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(fakeEmail)}`,
        { cache: "no-store", headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } }
      )
      const orphan = (lookup.ok ? await lookup.json() : null)?.users?.find(u => u.email === fakeEmail)
      if (!orphan) return NextResponse.json({ error: "Could not create the login. Please try again." }, { status: 500 })
      const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(orphan.id, { password: authPassword, user_metadata: { username } })
      if (upErr) return NextResponse.json({ error: "Could not create the login. Please try again." }, { status: 500 })
      authUserId = orphan.id
      relinkedOrphan = true
    } else {
      authUserId = created.user.id
    }

    const { data: member, error: insertErr } = await supabaseAdmin.from("members").insert({
      name, username, pin, auth_id: authUserId, is_admin: false, status: "active",
      joined_date: new Date().toISOString().split("T")[0],
    }).select("id").single()

    if (insertErr) {
      if (!relinkedOrphan) await supabaseAdmin.auth.admin.deleteUser(authUserId)
      const dup = /duplicate|unique/i.test(insertErr.message || "")
      return NextResponse.json({ error: dup ? "That username is already taken." : "Could not create the account. Please try again." }, { status: dup ? 409 : 500 })
    }

    // Two-way link: attach an existing standalone contact to the new member so
    // its extra info (phone/title/categories) carries over and it stops
    // showing as a separate non-member contact.
    if (contactId) {
      await supabaseAdmin.from("contacts").update({ member_id: member.id, active: true }).eq("id", contactId).is("member_id", null)
    }

    return NextResponse.json({ ok: true, member_id: member.id })
  }

  // ── Reset a member's PIN ─────────────────────────────────────────────────────
  // No old-pin check (that's the point — the resident forgot it). Updates the
  // Auth password when an auth user exists; always updates members.pin (login
  // lazily creates the Auth user from pin if auth_id is still null).
  if (action === "reset_pin") {
    const memberId = body.member_id
    const pin = body.pin == null ? "" : String(body.pin)
    if (!memberId) return NextResponse.json({ error: "member_id required" }, { status: 400 })
    const err = validatePin(pin)
    if (err) return NextResponse.json({ error: err }, { status: 400 })

    const { data: member } = await supabaseAdmin
      .from("members").select("id, auth_id").eq("id", memberId).single()
    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 })

    if (member.auth_id) {
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(member.auth_id, { password: toAuthPassword(pin) })
      if (authErr) return NextResponse.json({ error: "Could not reset the PIN. Please try again." }, { status: 500 })
    }
    const { error: pinErr } = await supabaseAdmin.from("members").update({ pin }).eq("id", memberId)
    if (pinErr) return NextResponse.json({ error: "Could not reset the PIN. Please try again." }, { status: 500 })

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
