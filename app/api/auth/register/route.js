import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function toAuthPassword(pin) {
  return pin + '_hive'
}

export async function POST(request) {
  try {
    const { inviteCode, username, password, confirmPassword } = await request.json()

    if (inviteCode !== 'element2026') {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 403 })
    }
    if (!username || username.trim().length < 3) {
      return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 })
    }
    if (!password || password.length < 4) {
      return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 })
    }
    if (password !== confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 })
    }

    // Check username not taken
    const { data: existing } = await supabaseAdmin
      .from('members')
      .select('id')
      .ilike('username', username.trim())
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
    }

    const fakeEmail = `${username.trim().toLowerCase()}@thesocialhive.internal`
    const authPassword = toAuthPassword(password)

    // Create Supabase Auth user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: fakeEmail,
      password: authPassword,
      email_confirm: true,
      user_metadata: { username: username.trim() }
    })
    if (createError) {
      return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
    }

    // Insert member record
    const { error: insertError } = await supabaseAdmin.from('members').insert({
      name: username.trim(),
      username: username.trim(),
      pin: password,
      auth_id: newUser.user.id,
      is_admin: false,
      status: 'active',
      joined_date: new Date().toISOString().split('T')[0]
    })

    if (insertError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
