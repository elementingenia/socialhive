import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import { paymentReminderDue } from "@/lib/payments"

// Daily safety-net reminder for paid events whose payment_due_by has arrived
// with a confirmed booking still unpaid (feedback round 2026-07-16, workstream
// C). The EC's manual nudges -- coordinator route's remind_payment (per
// attendee) and close_out_payments (bulk) -- cover proactive reminders; this
// covers "nobody remembered to send one by the due date". Decision #3: FLAG
// ONLY -- it never releases the seat.
//
// Mirrors app/api/cron/book-return-check exactly, including the two caching
// gotchas found live on 2026-07-15: force-dynamic AND a no-store fetch on the
// supabase client, or a just-written *_reminded_at reads back stale on the
// next run. See that route for the full write-up.
export const dynamic = "force-dynamic"


// Once-only per booking via bookings.payment_reminded_at (migration 043) so a
// resident isn't nagged daily past the due date. Vercel Cron issues GET with
// Authorization: Bearer <CRON_SECRET>; fails closed if CRON_SECRET is unset,
// same reasoning as book-return-check (an unconfigured endpoint here could
// spam every unpaid resident).
export async function GET(req) {
  const configuredSecret = process.env.CRON_SECRET
  if (!configuredSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  }
  const auth = req.headers.get("authorization") || ""
  if (auth !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const todayStr = new Date().toISOString().slice(0, 10)

  // Fetch confirmed bookings on paid events that have a due date set. Same
  // pragmatic approach as book-return-check: pull the (small) candidate set and
  // do the date/paid comparison in plain JS rather than relying on embedded-
  // resource PostgREST filters, which proved unreliable from a deployed route.
  const { data: rows, error } = await supa
    .from("bookings")
    .select("id, member_id, seats, status, payment_status, payment_reminded_at, event_id, events!inner(id, title, cost, payment_required, payment_due_by)")
    .eq("status", "confirmed")
    .eq("events.payment_required", true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const due = (rows || []).filter(b => paymentReminderDue(b.events, b, todayStr))

  let reminded = 0
  for (const b of due) {
    const ev = b.events
    const cost = parseFloat(ev?.cost) || 0
    const owed = (cost * (b.seats || 1)).toFixed(2)
    let dueText = ""
    if (ev?.payment_due_by) {
      const [y, m, d] = ev.payment_due_by.split("-").map(Number)
      dueText = new Date(y, m - 1, d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    }
    const overdue = todayStr > ev.payment_due_by
    const msg = overdue
      ? `Payment of $${owed} for ${ev.title || "this event"} was due ${dueText} — please pay your coordinator.`
      : `Payment of $${owed} for ${ev.title || "this event"} is due today (${dueText}) — please pay your coordinator.`
    await notify(b.member_id, b.event_id, "payment_reminder", msg)
    await supa.from("bookings").update({ payment_reminded_at: new Date().toISOString() }).eq("id", b.id)
    reminded++
  }

  return NextResponse.json({ ok: true, checked: (rows || []).length, reminded })
}
