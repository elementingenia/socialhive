import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notifyEventAttendees } from "@/lib/notifyEventAttendees"

// Daily catch-up for the event_updated debounce (Iain, 2026-09-17 --
// confirmed root cause + design after the Dementia Awareness Seminar
// complaint; see supabase/migrations/108_event_update_notify_debounce.sql
// and lib/notifyEventUpdated.js for the full write-up).
//
// notifyEventDetailsChanged() holds any qualifying edit that lands inside
// an event's 60-minute cooldown instead of sending immediately, flagging
// the event update_notify_pending = true with the latest message. This
// cron is what actually sends those held edits -- without it, an event
// that only ever gets edited inside its own cooldown window would never
// notify anyone at all.
//
// Runs once daily like the other 6 crons in this project (Vercel Hobby
// tier doesn't offer a cheap tighter cadence). Flushes any pending event
// that has gone quiet -- no further edit -- for at least SETTLE_MS, so a
// resident editing across a lunch break still gets bundled into one
// notification rather than getting flushed mid-edit. Same auth pattern as
// the other crons: fails closed if CRON_SECRET is unset.
export const dynamic = "force-dynamic"

const SETTLE_MS = 2 * 60 * 60 * 1000 // 2 hours since the last held edit

export async function GET(req) {
  const configuredSecret = process.env.CRON_SECRET
  if (!configuredSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  }
  const auth = req.headers.get("authorization") || ""
  if (auth !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const cutoffIso = new Date(Date.now() - SETTLE_MS).toISOString()

  const { data: pending, error } = await supa
    .from("events")
    .select("id, title, update_notify_pending_message, update_notify_pending_exclude_member_id, update_notify_last_edit_at")
    .eq("update_notify_pending", true)
    .lte("update_notify_last_edit_at", cutoffIso)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let flushed = 0
  for (const ev of (pending || [])) {
    const message = ev.update_notify_pending_message || `${ev.title || "An event you booked"} has been updated.`
    await notifyEventAttendees(supa, ev.id, "event_updated", message, {
      excludeMemberId: ev.update_notify_pending_exclude_member_id || undefined,
    })
    await supa
      .from("events")
      .update({
        update_notify_last_sent_at: new Date().toISOString(),
        update_notify_pending: false,
        update_notify_last_edit_at: null,
        update_notify_pending_message: null,
        update_notify_pending_exclude_member_id: null,
      })
      .eq("id", ev.id)
    flushed++
  }

  return NextResponse.json({ ok: true, checked: (pending || []).length, flushed })
}
