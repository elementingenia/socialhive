import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { newAuthEmail } from "@/lib/authEmail"
import { validateNewAccount, validateUsername, validatePin } from "@/lib/accounts"
import { sydneyTodayStr } from "@/lib/date"

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
  // Rename a member's username. Possible at all only because migration 066
  // stopped deriving the Auth email from it -- this is now a plain UPDATE on
  // members with no Auth involvement whatsoever. Deliberately does NOT touch
  // auth_email, auth_id, or pin: the person keeps logging in with exactly the
  // same credentials, just typing a different username.
  if (action === "set_username") {
    const memberId = body.member_id
    const username = (body.username || "").trim()
    if (!memberId) return NextResponse.json({ error: "member_id required" }, { status: 400 })

    const err = validateUsername(username)
    if (err) return NextResponse.json({ error: err }, { status: 400 })

    const { data: target } = await supabaseAdmin
      .from("members").select("id, username").eq("id", memberId).maybeSingle()
    if (!target) return NextResponse.json({ error: "Account not found" }, { status: 404 })
    if (target.username === username) return NextResponse.json({ ok: true, unchanged: true })

    // testbot is the E2E fixture (protected from deletion by a DB trigger,
    // migration 033). Renaming it would break CI just as quietly, so block it.
    if (target.username === "testbot") {
      return NextResponse.json({ error: "testbot is the automated-test account and cannot be renamed." }, { status: 400 })
    }

    const { data: clash } = await supabaseAdmin
      .from("members").select("id").ilike("username", username).maybeSingle()
    if (clash && clash.id !== memberId) {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 })
    }

    const { error } = await supabaseAdmin
      .from("members").update({ username }).eq("id", memberId)
    if (error) {
      const dup = /duplicate|unique/i.test(error.message || "")
      return NextResponse.json({ error: dup ? "That username is already taken." : "Could not rename the account." }, { status: dup ? 409 : 500 })
    }
    return NextResponse.json({ ok: true, username, previous: target.username })
  }

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

    // Random and permanent -- see migration 066. Never derived from username.
    const fakeEmail = newAuthEmail()
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
      name, username, pin, auth_id: authUserId, auth_email: fakeEmail,
      // Admin-created: the PIN is handed over, so force a change on first
      // login (migration 067). Self-registration leaves this false.
      must_change_pin: true,
      is_admin: false, status: "active",
      joined_date: sydneyTodayStr(),
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
    // An admin-set PIN is a handed-over credential, same as on creation, so
    // the member must replace it on their next login (migration 067).
    const { error: pinErr } = await supabaseAdmin.from("members")
      .update({ pin, must_change_pin: true }).eq("id", memberId)
    if (pinErr) return NextResponse.json({ error: "Could not reset the PIN. Please try again." }, { status: 500 })

    return NextResponse.json({ ok: true })
  }

  // ── Deactivate / reactivate a member ────────────────────────────────────────
  // The safe, reversible way to "remove" someone -- blocks login (login/route.js
  // already refuses any status !== 'active') without touching a single row of
  // their history. This is the button to reach for by default; delete_member
  // below is for a genuinely empty duplicate only (Iain, 2026-08-04: the
  // Janelle Pratten / Janelle house-25 duplicate that prompted this feature).
  if (action === "set_member_status") {
    const memberId = body.member_id
    const status = body.status === "active" ? "active" : "inactive"
    if (!memberId) return NextResponse.json({ error: "member_id required" }, { status: 400 })

    const { data: target } = await supabaseAdmin.from("members").select("id, username").eq("id", memberId).maybeSingle()
    if (!target) return NextResponse.json({ error: "Account not found" }, { status: 404 })
    if (target.username === "testbot") {
      return NextResponse.json({ error: "testbot is the automated-test account and cannot be deactivated." }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from("members").update({ status }).eq("id", memberId)
    if (error) return NextResponse.json({ error: "Could not update the account." }, { status: 500 })
    return NextResponse.json({ ok: true, status })
  }

  // ── Delete a member outright ─────────────────────────────────────────────────
  // Genuinely irreversible, so guarded: refuses if the member has ANY row of
  // real history (a booking, a coordinator assignment, a club membership, a
  // vote, a DVD loan, a bar tab, an ownership record, a question they asked or
  // answered) -- same reasoning as screenings/route.js's DELETE (a hard delete
  // would cascade that history away) and Locations' delete-venue guard. In
  // that case the caller should use set_member_status instead. Only genuinely
  // unused rows -- e.g. a duplicate created in error, never logged in or
  // booked anything -- can actually be deleted this way.
  if (action === "delete_member") {
    const memberId = body.member_id
    if (!memberId) return NextResponse.json({ error: "member_id required" }, { status: 400 })

    const { data: target } = await supabaseAdmin
      .from("members").select("id, username, auth_id").eq("id", memberId).maybeSingle()
    if (!target) return NextResponse.json({ error: "Account not found" }, { status: 404 })
    if (target.username === "testbot") {
      return NextResponse.json({ error: "testbot is the automated-test account and cannot be deleted." }, { status: 400 })
    }

    // Tables carrying real history that a hard delete must never cascade away.
    const HISTORY_TABLES = [
      ["bookings", "member_id"], ["booking_attendees", "member_id"],
      ["event_coordinators", "member_id"], ["club_members", "member_id"],
      ["space_owners", "member_id"], ["dvd_loans", "member_id"],
      ["bar_tabs", "member_id"], ["bar_member_payments", "member_id"],
      ["movie_ownership", "member_id"], ["votes", "member_id"],
      ["book_votes", "member_id"], ["questions", "asker_member_id"],
      ["question_replies", "member_id"],
    ]
    for (const [table, col] of HISTORY_TABLES) {
      const { count, error } = await supabaseAdmin.from(table).select(col, { count: "exact", head: true }).eq(col, memberId)
      if (error) return NextResponse.json({ error: `Could not verify account history (${table}).` }, { status: 500 })
      if (count > 0) {
        return NextResponse.json({
          error: `This account has ${count} row${count === 1 ? "" : "s"} of real history in ${table} -- deleting it would destroy that record. Use Deactivate instead.`,
        }, { status: 409 })
      }
    }

    // Clean, ephemeral-only rows -- safe to just clear, not history worth keeping.
    await supabaseAdmin.from("notifications").delete().eq("member_id", memberId)
    await supabaseAdmin.from("push_subscriptions").delete().eq("member_id", memberId)
    await supabaseAdmin.from("hub_followers").delete().eq("member_id", memberId)
    // Unlink (not delete) any standalone contact row that pointed at this member.
    await supabaseAdmin.from("contacts").update({ member_id: null }).eq("member_id", memberId)

    if (target.auth_id) await supabaseAdmin.auth.admin.deleteUser(target.auth_id)

    const { error: delErr } = await supabaseAdmin.from("members").delete().eq("id", memberId)
    if (delErr) return NextResponse.json({ error: "Could not delete the account." }, { status: 500 })

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
