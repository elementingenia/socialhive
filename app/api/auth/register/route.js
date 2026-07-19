import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'


function toAuthPassword(pin) {
  return pin + '_hive'
}

export async function POST(request) {
  try {
    const { inviteCode, username, password, confirmPassword } = await request.json()

    // Read invite token from settings (DB-driven, not hardcoded)
    const { data: setting } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'invite_token')
      .single()
    const validToken = setting?.value || 'element2026'

    if (inviteCode !== validToken) {
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
    let authUserId = null
    let relinkedOrphan = false
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: fakeEmail,
      password: authPassword,
      email_confirm: true,
      user_metadata: { username: username.trim() }
    })

    if (createError) {
      // The one recoverable case: a members row can be deleted directly in
      // the DB (e.g. cleaning up a test/duplicate account) without ever
      // deleting the linked Auth user, leaving a dangling login with no
      // profile. We've already confirmed above that no *members* row uses
      // this username, so if Auth says the email is taken, it's an orphan
      // from exactly that scenario - relink it instead of failing outright.
      const emailTaken = /already been registered|already exists/i.test(createError.message || '')
      if (!emailTaken) {
        return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
      }

      const lookupRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(fakeEmail)}`,
        { cache: "no-store", headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } }
      )
      const lookupData = lookupRes.ok ? await lookupRes.json() : null
      const orphan = lookupData?.users?.find(u => u.email === fakeEmail)
      if (!orphan) {
        return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(orphan.id, {
        password: authPassword,
        user_metadata: { username: username.trim() },
      })
      if (updateError) {
        return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
      }
      authUserId = orphan.id
      relinkedOrphan = true
    } else {
      authUserId = newUser.user.id
    }

    // Insert member record
    const { error: insertError } = await supabaseAdmin.from('members').insert({
      name: username.trim(),
      username: username.trim(),
      pin: password,
      auth_id: authUserId,
      is_admin: false,
      status: 'active',
      joined_date: new Date().toISOString().split('T')[0]
    })

    if (insertError) {
      // Only safe to delete the Auth user here if we created it fresh this
      // request - if we just relinked a pre-existing orphan, it's not ours
      // to destroy on a failed insert.
      if (!relinkedOrphan) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId)
      }
      return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
