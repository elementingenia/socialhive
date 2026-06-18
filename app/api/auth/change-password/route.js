import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
  try {
    const { username, currentPassword, newPassword } = await request.json()

    if (!username || !currentPassword || !newPassword) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }
    if (newPassword.length < 4) {
      return NextResponse.json({ error: 'New password must be at least 4 characters' }, { status: 400 })
    }

    // Verify current credentials
    const { data: member, error: memberError } = await supabaseAdmin
      .from('members')
      .select('id, username, pin, auth_id')
      .ilike('username', username.trim())
      .single()

    if (memberError || !member) {
      return NextResponse.json({ error: 'Username not found' }, { status: 401 })
    }
    if (member.pin !== currentPassword) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })
    }

    // Update Supabase Auth password first (if auth_id exists)
    if (member.auth_id) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        member.auth_id,
        { password: newPassword }
      )
      if (authError) {
        console.error('Auth password update failed:', authError)
        return NextResponse.json({ error: 'Password update failed. Please try again.' }, { status: 500 })
      }
    }

    // Then update pin in members table
    const { error: pinError } = await supabaseAdmin
      .from('members')
      .update({ pin: newPassword })
      .eq('id', member.id)

    if (pinError) {
      console.error('Pin update failed:', pinError)
      // Auth password was already updated — try to roll back
      if (member.auth_id) {
        await supabaseAdmin.auth.admin.updateUserById(member.auth_id, { password: currentPassword })
      }
      return NextResponse.json({ error: 'Password update failed. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Change password error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
