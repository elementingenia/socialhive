import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import { expiryReminderDue, expiringNotification } from "@/lib/swap"

// Swap & Sell expiry reminder (Scope_Answered decision 3, Iain 2026-10-05).
// Listings come off Browse on their own once expires_at passes -- nothing to
// do for that. This only sends the seller ONE "comes down in 3 days, tap
// Keep it listed" reminder (swap_listings.expiry_reminded_at). Runs daily at
// 22:15 UTC = 9:15am AEDT. Same shape as the other crons: force-dynamic,
// GET only, CRON_SECRET fail-closed.
export const dynamic = "force-dynamic"

export async function GET(req) {
  const configuredSecret = process.env.CRON_SECRET
  if (!configuredSecret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  if ((req.headers.get("authorization") || "") !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const now = new Date()
  const { data: rows, error } = await supa.from("swap_listings")
    .select("id, member_id, type, title, status, hidden_at, expires_at, expiry_reminded_at")
    .neq("status", "gone").is("hidden_at", null).is("expiry_reminded_at", null)
    .gt("expires_at", now.toISOString())
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const due = (rows || []).filter(l => expiryReminderDue(l, now))
  for (const l of due) {
    await notify(l.member_id, null, "swap_expiring", expiringNotification(l), "/swap/mine")
  }
  if (due.length) {
    await supa.from("swap_listings").update({ expiry_reminded_at: now.toISOString() }).in("id", due.map(l => l.id))
  }
  return NextResponse.json({ ok: true, reminded: due.length })
}
