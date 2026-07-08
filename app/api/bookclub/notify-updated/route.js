import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyEventAttendees } from '@/lib/notifyEventAttendees'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Book Club's event edit happens as a direct client-side supabase.from('events')
// .update() call (no service-role API route backs it, unlike Movies/Social).
// Rather than insert notifications from the client — which would need a
// looser RLS policy that we just closed off in migration 034 — the client
// calls this tiny admin-gated endpoint after a successful edit to fire the
// notification server-side instead.
export async function POST(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: member } = await supabaseAdmin
    .from('members').select('is_admin').eq('auth_id', user.id).single()
  if (!member?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { event_id, title } = await req.json()
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  await notifyEventAttendees(supabaseAdmin, event_id, 'event_updated',
    `${title || 'This Book Club meeting'} has been rescheduled — check the new date.`)

  return NextResponse.json({ ok: true })
}
