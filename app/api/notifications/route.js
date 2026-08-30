import { supabaseAdmin } from "@/lib/supabaseAdmin"
export const dynamic = "force-dynamic"
import { NextResponse } from 'next/server'
import { rewordEventReminder, isExpiredEventReminder } from "@/lib/notifications"

async function getMember(token) {
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data } = await supabaseAdmin
    .from('members').select('id').eq('auth_id', user.id).single()
  return data || null
}

// GET — fetch notifications for current member
export async function GET(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('id, type, message, created_at, read_at, event_id, events(title, event_date, event_time, location, hub_type)')
    .eq('member_id', member.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // A day-before reminder stops being actionable the instant its event has
  // actually started. Per Iain's explicit ask (2026-08-30, "should not
  // remain active for attention"), auto-mark any still-unread event_reminder
  // read in this same request once that's true -- not a separate cron --
  // so a resident who never opens the drawer that day doesn't carry a
  // phantom unread badge indefinitely, and the count stays consistent with
  // the (also-recomputed) message text on every poll.
  const now = new Date()
  const nowIso = now.toISOString()
  const expiredIds = (data || []).filter(n => isExpiredEventReminder(n, now)).map(n => n.id)

  if (expiredIds.length) {
    await supabaseAdmin.from('notifications').update({ read_at: nowIso }).in('id', expiredIds)
  }

  const out = (data || []).map(n => rewordEventReminder(
    expiredIds.includes(n.id) ? { ...n, read_at: n.read_at || nowIso } : n,
    now,
  ))

  return NextResponse.json(out)
}

// PATCH — mark notifications as read
// Body: { all: true } to mark all, or { ids: [...] } for specific ones
export async function PATCH(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const now = new Date().toISOString()

  let query = supabaseAdmin
    .from('notifications')
    .update({ read_at: now })
    .eq('member_id', member.id)
    .is('read_at', null)

  if (!body.all && body.ids?.length) {
    query = query.in('id', body.ids)
  }

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
