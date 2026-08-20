import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'

// Profile's "Change PIN" modal (components/PinModal.js) posts here. The
// caller is already logged in with a Supabase Auth session — unlike
// /api/auth/change-password (used only by the pre-login forced-PIN-change
// flow in app/login/page.js, which has no session yet and so authenticates
// by username+current PIN instead), this route identifies the member from
// the session's Bearer token and only needs the current/new PIN.
//
// Bug fixed 2026-08-20: this route never existed. PinModal.js has always
// posted to /api/pin, which 404'd, and the frontend's `res.json().catch(() =>
// ({}))` silently swallowed the resulting HTML-not-JSON parse failure and
// fell back to its hardcoded default error text — "PIN change failed —
// check your current PIN" — regardless of whether the PIN entered was
// actually correct. Confirmed live: curl POST /api/pin returned a genuine
// 404 HTML page, not a JSON error. `git log -- app/api/pin` shows no history
// at all — the route was never created, not removed.
export const dynamic = "force-dynamic"

function toAuthPassword(pin) {
  return pin + '_hive'
}

export async function POST(request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const { data: { user }, error: authUserError } = await supabaseAdmin.auth.getUser(token)
    if (authUserError || !user) {
      return NextResponse.json({ error: 'Session expired — please sign in again' }, { status: 401 })
    }

    const { current_pin, new_pin } = await request.json()
    if (!current_pin || !new_pin) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }
    if (!/^\d{4,8}$/.test(new_pin)) {
      return NextResponse.json({ error: 'PIN must be 4–8 digits' }, { status: 400 })
    }

    const { data: member, error: memberError } = await supabaseAdmin
      .from('members')
      .select('id, pin, auth_id')
      .eq('auth_id', user.id)
      .single()

    if (memberError || !member) {
      return NextResponse.json({ error: 'Account not found' }, { status: 401 })
    }
    if (member.pin !== current_pin) {
      return NextResponse.json({ error: 'Current PIN is incorrect' }, { status: 401 })
    }

    // Update Supabase Auth password first (if auth_id exists) — same
    // ordering as /api/auth/change-password, so a failure here leaves the
    // members.pin row untouched rather than desynced from the real login
    // credential.
    if (member.auth_id) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        member.auth_id,
        { password: toAuthPassword(new_pin) }
      )
      if (authError) {
        return NextResponse.json({ error: 'PIN update failed. Please try again.' }, { status: 500 })
      }
    }

    const { error: pinError } = await supabaseAdmin
      .from('members')
      .update({ pin: new_pin, must_change_pin: false })
      .eq('id', member.id)

    if (pinError) {
      // Roll back the Auth password so the two stores don't desync.
      if (member.auth_id) {
        await supabaseAdmin.auth.admin.updateUserById(member.auth_id, { password: toAuthPassword(current_pin) })
      }
      return NextResponse.json({ error: 'PIN update failed. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
