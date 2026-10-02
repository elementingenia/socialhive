import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import { sydneyTodayStr } from "@/lib/date"
import { digestMessage, digestHasContent, digestRecipients } from "@/lib/digest"
import { gatherDigest, pendingInvites } from "@/lib/digestData"

export const dynamic = "force-dynamic"

// Weekly Digest (Iain, 2026-10-02) -- Sunday afternoon, every resident who
// has logged in at least once and hasn't switched it off in Profile
// (members.weekly_digest, default on). vercel.json: "0 5 * * 0" = Sunday
// 4pm AEDT / 3pm AEST (one fixed UTC time drifts an hour across daylight
// saving -- accepted in the scope).
//
// Safety:
//  - CRON_SECRET fail-closed, same as every other cron.
//  - ?dry_run=1 returns exactly what WOULD be sent (counts, message,
//    recipient count) without writing or sending anything. This is how it
//    gets tested -- never through a real send (LIVE USERS rule: a real run
//    pushes to every resident).
//  - Double-send impossible: digest_runs has the Sydney date as its PRIMARY
//    KEY and is inserted BEFORE anything is sent; a second run the same day
//    fails that insert and stops.
//  - Quiet week: nothing community-wide on -> nothing sent, no run recorded.
export async function GET(req) {
  const configuredSecret = process.env.CRON_SECRET
  if (!configuredSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  }
  const auth = req.headers.get("authorization") || ""
  if (auth !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }
  const dryRun = new URL(req.url).searchParams.get("dry_run") === "1"

  // Admin master switch (hub_settings 'weekly_digest', admin-only, seeded
  // off by migration 118). Off = no send at all; a dry run still reports
  // what WOULD go out, so an admin can check it before switching on.
  const { data: master } = await supa.from("hub_settings")
    .select("enabled").eq("hub_type", "weekly_digest").maybeSingle()
  const switchedOn = !!master?.enabled

  const now = new Date()
  const digest = await gatherDigest(now)
  if (!switchedOn && !dryRun) {
    return NextResponse.json({ ok: true, skipped: "switched_off_by_admin" })
  }
  if (!digestHasContent(digest.counts)) {
    return NextResponse.json({ ok: true, skipped: "nothing_on", counts: digest.counts, dryRun })
  }

  const { data: members, error: mErr } = await supa.from("members")
    .select("id, status, auth_id, is_test, weekly_digest")
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })
  const recipients = digestRecipients(members || [])
  const invites = await pendingInvites(recipients, now)

  if (dryRun) {
    return NextResponse.json({
      ok: true, dryRun: true, switchedOn, counts: digest.counts,
      message: digestMessage(digest.counts),
      recipients: recipients.length,
      recipientsWithInvites: [...invites.keys()].filter(id => recipients.includes(id)).length,
    })
  }

  const runDate = sydneyTodayStr(now)
  const { error: runErr } = await supa.from("digest_runs").insert({ run_date: runDate, recipients: recipients.length })
  if (runErr) {
    // Duplicate key = already sent today. Anything else = don't risk sending.
    return NextResponse.json({ ok: true, skipped: "already_sent_or_unrecorded", detail: runErr.message })
  }

  // Small parallel batches: fast enough for ~170 residents inside the
  // function time limit without hammering the database all at once.
  let sent = 0
  for (let i = 0; i < recipients.length; i += 20) {
    const batch = recipients.slice(i, i + 20)
    await Promise.all(batch.map(id =>
      notify(id, null, "weekly_digest", digestMessage(digest.counts, (invites.get(id) || []).length), "/digest")))
    sent += batch.length
  }
  return NextResponse.json({ ok: true, counts: digest.counts, sent })
}
