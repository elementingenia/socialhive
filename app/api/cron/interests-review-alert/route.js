import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import { STATUS, pendingToAlert, adminAlertMessage } from "@/lib/interests"

// Once-daily admin alert for new interest suggestions (backlog B3, Q2
// caveat, Iain 2026-10-02: "a notification is sent to admins overnight when
// there are new chips to review"). Runs 21:00 UTC (vercel.json) = 8am AEDT /
// 7am AEST -- morning rather than literally overnight, so admins with phone
// alerts on aren't woken. Only fires when there's at least one suggestion no
// admin has been alerted about yet; each suggestion is announced once
// (interest_tags.admin_alerted_at). Same shape as the other crons:
// force-dynamic, GET only, CRON_SECRET fail-closed.
export const dynamic = "force-dynamic"

export async function GET(req) {
  const configuredSecret = process.env.CRON_SECRET
  if (!configuredSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  }
  if ((req.headers.get("authorization") || "") !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const { data: pending, error } = await supa.from("interest_tags")
    .select("id, status, admin_alerted_at").eq("status", STATUS.PENDING)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const fresh = pendingToAlert(pending)
  const message = adminAlertMessage(fresh.length, (pending || []).length)
  if (!message) return NextResponse.json({ ok: true, pending: (pending || []).length, alerted: 0 })

  const { data: admins } = await supa.from("members")
    .select("id").eq("is_admin", true).eq("status", "active").eq("is_test", false)
  for (const a of admins || []) {
    await notify(a.id, null, "interest_review_pending", message, "/admin?tab=Interests")
  }
  await supa.from("interest_tags").update({ admin_alerted_at: new Date().toISOString() })
    .in("id", fresh.map(t => t.id))

  return NextResponse.json({ ok: true, pending: (pending || []).length, alerted: fresh.length, notified: (admins || []).length })
}
