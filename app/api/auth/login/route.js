import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
  try {
    const { username, pin } = await request.json()

    if (!username || !pin) {
      return NextResponse.json({ error: 'Name and PIN required' }, { status: 400 })
    }

    // Look up member by username (case-insensitive)
    const { data: member, error: memberError } = await supabaseAdmin
      .from('members')
      .select('id, username, pin, auth_id')
      .ilike('username', username.trim())
      .single()

    if (memberError || !member) {
      return NextResponse.json({ error: 'Name not found. Check spelling and try again.' }, { status: 401 })
    }

    if (member.pin !== pin) {
      return NextResponse.json({ error: 'Incorrect PIN. Try again.' }, { status: 401 })
    }

    // Build the fake internal email used for Supabase Auth
    const fakeEmail = `${member.username.toLowerCase().replace(/\s+/g, '.')}@thesocialhive.internal`

    // First login — create Supabase Auth user
    if (!member.auth_id) {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: fakeEmail,
        password: pin,
        email_confirm: true,
        user_metadata: { member_id: member.id, username: member.username }
      })
      if (createError) {
        console.error('createUser error:', createError)
        return NextResponse.json({ error: 'Account setup failed. Contact admin.' }, { status: 500 })
      }
      await supabaseAdmin.from('members').update({ auth_id: newUser.user.id }).eq('id', member.id)
    }

    return NextResponse.json({ email: fakeEmail })
  } catch (err) {
    console.error('Login route error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
