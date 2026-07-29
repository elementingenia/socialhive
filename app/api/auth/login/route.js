import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
import { ensureAuthEmail } from "@/lib/authEmail"


// Supabase Auth requires 6+ char passwords — pin may be shorter, so we pad
function toAuthPassword(pin) {
  return pin + '_hive'
}

export async function POST(request) {
  try {
    const { username, password } = await request.json()
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
    }

    // Look up member
    const { data: member, error: memberError } = await supabaseAdmin
      .from('members')
      .select('id, username, pin, auth_id, status, auth_email')
      .ilike('username', username.trim())
      .single()

    if (memberError || !member) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }
    if (member.status !== 'active') {
      return NextResponse.json({ error: 'Account is not active' }, { status: 403 })
    }
    if (member.pin !== password) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    // Read the stored Auth email; never rebuild it from the username, or a
    // renamed member can no longer log in (migration 066). ensureAuthEmail
    // heals any pre-066 row the backfill missed, once.
    const fakeEmail = await ensureAuthEmail(supabaseAdmin, member)
    if (!fakeEmail) {
      return NextResponse.json({ error: 'Login failed' }, { status: 500 })
    }
    const authPassword = toAuthPassword(member.pin)

    // Create Supabase Auth user if not yet linked
    if (!member.auth_id) {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: fakeEmail,
        password: authPassword,
        email_confirm: true,
        user_metadata: { username: member.username }
      })
      if (createError) {
        return NextResponse.json({ error: 'Login failed' }, { status: 500 })
      }
      await supabaseAdmin.from('members').update({ auth_id: newUser.user.id }).eq('id', member.id)
    }

    return NextResponse.json({ email: fakeEmail, authPassword })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
