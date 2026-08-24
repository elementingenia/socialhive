import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Daily retention sweep for read notifications (Iain, 2026-08-24 --
// discussion prompted by the read/unread sort bug fixed the same session).
// Nothing in this app has ever deleted a notification row except as a
// side effect of removing the member's whole account
// (app/api/admin/accounts/route.js) -- read notifications otherwise
// accumulate forever, one row per member per event. The GET route already
// caps what's *displayed* at the 50 most recent per person
// (app/api/notifications/route.js), so nothing looked broken, but the
// table itself just grows unbounded underneath that.
//
// Policy (Iain's call, 60 days): a notification is only ever eligible once
// it has actually been read/acknowledged -- read_at IS NOT NULL -- and
// read_at is older than 60 days. Unread notifications are NEVER touched
// here regardless of age: this resident base skews lower digital literacy
// and may not open the app for weeks at a stretch, so silently deleting
// something nobody has acted on yet would be a real loss, not a cleanup.
//
// Triggered by Vercel Cron (see vercel.json) once a day. GET only, since
// Vercel Cron always issues GET requests. Same CRON_SECRET fail-closed
// pattern as every other cron in this app (see book-return-check for the
// full rationale) -- if the secret isn't configured, refuse to run rather
// than risk an unauthenticated caller triggering a bulk delete.
export async function GET(req) {
  const configuredSecret = process.env.CRON_SECRET
  if (!configuredSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  }
  const auth = req.headers.get("authorization") || ""
  if (auth !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const RETENTION_DAYS = 60
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: deleted, error } = await supa
    .from("notifications")
    .delete()
    .not("read_at", "is", null)
    .lt("read_at", cutoff)
    .select("id")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, deleted: (deleted || []).length, cutoff })
}
