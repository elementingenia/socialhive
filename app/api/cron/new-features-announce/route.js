import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import { sydneyTodayStr } from "@/lib/date"
import {
  NEW_FEATURES_KEY, isSendTime, featureMessage, featureRecipients, normaliseAudience,
  featureDocTitle, featureDocFileName, featureDocLink,
} from "@/lib/newFeatures"
import { buildFeatureAnnouncementPdf } from "@/lib/featureAnnouncementPdf"

export const dynamic = "force-dynamic"

// New Features daily announcement (Scope_Answered, Iain 2026-10-03).
// Every APPROVED feature goes out together at 08:30 Sydney as ONE PDF in
// Documents > New Features plus ONE notification (decision 1).
//
// vercel.json runs this at 21:30 AND 22:30 UTC: Sydney is UTC+10 (AEST) or
// UTC+11 (AEDT), so exactly one of those two lands at 08:30 local; the other
// returns "not_send_time" without doing anything (isSendTime).
//
// Safety:
//  - CRON_SECRET fail-closed, same as every other cron.
//  - ?dry_run=1 reports what WOULD go out (any time of day), writes nothing.
//    That's how it gets tested -- a real run notifies real people.
//  - Master switch (hub_settings 'new_features'.enabled) seeded OFF; audience
//    seeded Admins only (decision 6).
//  - Double-send impossible: the day's PDF goes to a fixed Storage path with
//    upsert off, and documents.feature_date is UNIQUE (migration 123) -- a
//    second run the same day fails one of those and stops before notifying.
export async function GET(req) {
  const configuredSecret = process.env.CRON_SECRET
  if (!configuredSecret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  if ((req.headers.get("authorization") || "") !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }
  const dryRun = new URL(req.url).searchParams.get("dry_run") === "1"
  const now = new Date()
  if (!dryRun && !isSendTime(now)) return NextResponse.json({ ok: true, skipped: "not_send_time" })

  const { data: setting } = await supa.from("hub_settings")
    .select("enabled, digest_audience").eq("hub_type", NEW_FEATURES_KEY).maybeSingle()
  const switchedOn = !!setting?.enabled
  const audience = normaliseAudience(setting?.digest_audience)
  if (!switchedOn && !dryRun) return NextResponse.json({ ok: true, skipped: "switched_off_by_admin" })

  const { data: features, error: fErr } = await supa.from("feature_announcements")
    .select("id, title, summary, what_it_does, how_to_use, where_to_find")
    .eq("status", "approved").order("approved_at")
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 })
  if (!features?.length) return NextResponse.json({ ok: true, skipped: "nothing_approved", dryRun })

  const { data: members, error: mErr } = await supa.from("members")
    .select("id, status, auth_id, is_test, is_admin")
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })
  const recipients = featureRecipients(members || [], audience)
  const dateStr = sydneyTodayStr(now)
  const message = featureMessage(features)

  if (dryRun) {
    return NextResponse.json({
      ok: true, dryRun: true, switchedOn, audience, date: dateStr,
      features: features.map(f => f.title), message, recipients: recipients.length,
    })
  }

  const { data: folder } = await supa.from("document_categories")
    .select("id").eq("system_key", NEW_FEATURES_KEY).maybeSingle()
  if (!folder) return NextResponse.json({ error: "New Features category missing -- run migration 123" }, { status: 500 })

  // 1. The PDF, at a fixed per-day path (upsert off = second run stops here).
  const bytes = await buildFeatureAnnouncementPdf({ dateStr, features })
  const fileName = featureDocFileName(dateStr)
  const path = `new-features/${fileName}`
  const { error: upErr } = await supa.storage.from("community-docs").upload(path, Buffer.from(bytes), {
    contentType: "application/pdf", upsert: false, cacheControl: "31536000",
  })
  if (upErr) return NextResponse.json({ ok: true, skipped: "already_sent_or_upload_failed", detail: upErr.message })
  const { data: { publicUrl } } = supa.storage.from("community-docs").getPublicUrl(path)

  // 2. The Documents row, filed in the New Features folder.
  const { data: doc, error: docErr } = await supa.from("documents").insert({
    title: featureDocTitle(dateStr),
    description: features.map(f => f.title).join(" · ").slice(0, 500),
    file_url: publicUrl, file_name: fileName, file_type: "application/pdf",
    file_size: bytes.length, category_id: folder.id, feature_date: dateStr,
  }).select("id").single()
  if (docErr) return NextResponse.json({ ok: true, skipped: "already_sent_or_unrecorded", detail: docErr.message })
  const { error: linkErr } = await supa.from("document_category_links")
    .insert({ document_id: doc.id, category_id: folder.id })
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 })

  // 3. Mark the features announced, then notify.
  await supa.from("feature_announcements")
    .update({ status: "announced", announced_on: dateStr, document_id: doc.id, updated_at: now.toISOString() })
    .in("id", features.map(f => f.id))

  const link = featureDocLink(dateStr)
  let sent = 0
  for (let i = 0; i < recipients.length; i += 20) {
    const batch = recipients.slice(i, i + 20)
    await Promise.all(batch.map(id => notify(id, null, "new_features", message, link)))
    sent += batch.length
  }
  return NextResponse.json({ ok: true, date: dateStr, features: features.length, document_id: doc.id, sent })
}
