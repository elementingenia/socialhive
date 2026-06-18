import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const INVITE_CODE = 'element2026'

export async function POST(request) {
  try {
    const { inviteCode, username, password } = await request.json()

    if (!inviteCode || !username || !password) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }
    if (inviteCode.trim().toLowerCase() !== INVITE_CODE) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 401 })
    }
    if (username.trim().length < 2) {
      return NextResponse.json({ error: 'Username must be at least 2 characters' }, { status: 400 })
    }
    if (password.length < 4) {
      return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 })
    }

    // Check username not already taken
    const { data: existing } = await supabaseAdmin
      .from('members')
      .select('id')
      .ilike('username', username.trim())
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
    }

    const fakeEmail = `${username.trim().toLowerCase().replace(/\s+/g, '.')}@thesocialhive.internal`

    // Create Supabase Auth user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: fakeEmail,
      password,
      email_confirm: true,
      user_metadata: { username: username.trim() }
    })
    if (createError) {
      return NextResponse.json({ error: 'Account creation failed. Try a different username.' }, { status: 500 })
    }

    // Create member record
    const { error: memberError } = await supabaseAdmin.from('members').insert({
      name: username.trim(),
      username: username.trim(),
      pin: password,
      auth_id: newUser.user.id,
      is_admin: false,
      status: 'active',
      joined_date: new Date().toISOString().split('T')[0]
    })

    if (memberError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json({ error: memberError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Register error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
