import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import { eventReminderDue } from "@/lib/booking"

// Mirrors app/api/cron/book-return-check and payment-due-check exactly,
// including the two caching gotchas found live 2026-07-15 (force-dynamic AND
// a no-store fetch on the supabase client, or a just-written *_reminded_at
// reads back stale on the next run) -- see book-return-check for the full
// write-up.
export const dynamic = "force-dynamic"

// "Day-before" reminder for anything a resident has a confirmed seat on --
// every hub, not just one (Iain, 2026-07-26: "it's one that should be there
// anyway", flagged missing while drafting the community flyer). Once-only
// per booking via bookings.event_reminded_at (migration 064). Vercel Cron
// issues GET with Authorization: Bearer <CRON_SECRET>; fails closed if
// CRON_SECRET is unset, same reasoning as the other two crons (an
// unconfigured endpoint here could spam every resident with a booking).
export async function GET(req) {
  const configuredSecret = process.env.CRON_SECRET
  if (!configuredSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  }
  const auth = req.headers.get("authorization") || ""
  if (auth !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const now = new Date()
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const pad = (n) => String(n).padStart(2, "0")
  const tomorrowStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`

  // Pull tomorrow's confirmed bookings directly (event_date filter server-side
  // is fine here, unlike book-return-check's due-date comparison -- this is a
  // straight equality on an indexed date column, not the embedded-resource
  // filter that proved unreliable there).
  const { data: rows, error } = await supa
    .from("bookings")
    .select("id, member_id, status, event_reminded_at, event_id, events!inner(id, title, event_date, event_time, hub_type, location_type, location, archived)")
    .eq("status", "confirmed")
    .eq("events.event_date", tomorrowStr)
    .eq("events.archived", false)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const due = (rows || []).filter(b => eventReminderDue(b.events, b, tomorrowStr))

  let reminded = 0
  for (const b of due) {
    const ev = b.events
    const timeText = ev?.event_time ? ` at ${ev.event_time.slice(0, 5)}` : ""
    const whereText = ev?.location ? ` (${ev.location})` : ""
    const msg = `Reminder: ${ev?.title || "your event"} is tomorrow${timeText}${whereText}.`
    await notify(b.member_id, b.event_id, "event_reminder", msg)
    await supa.from("bookings").update({ event_reminded_at: new Date().toISOString() }).eq("id", b.id)
    reminded++
  }

  return NextResponse.json({ ok: true, checked: (rows || []).length, reminded })
}
