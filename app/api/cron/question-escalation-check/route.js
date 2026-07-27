import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import { contextLabel, getAdminIds } from "@/lib/questionRouting"

// Reads back its own just-written escalated_at on the next run, so it must
// never be served stale -- force-dynamic + the shared no-store supabaseAdmin
// client. Same class of bug as the 2026-07-15 book_return_reminded_at issue.
export const dynamic = "force-dynamic"

// Daily safety net for questions nobody has answered (Iain approved
// 2026-07-27; scope §8.4).
//
// Why this exists: admins already have PASSIVE oversight -- answeringBoxQuestions()
// returns every question to any admin -- but nothing ever TOLD them. A question
// could sit 'open' indefinitely and the only feedback loop was the asker
// complaining. That gap matters most for the new 'category' target, which is
// the first routing context whose recipients have no single named owner: a
// 4-person Committee with first-to-answer semantics is exactly the shape where
// everyone assumes someone else has it.
//
// Applies to ALL context types, not just category -- a club or event question
// can black-hole just as easily; category is only what surfaced the gap.
//
// Auth: Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron-triggered
// requests. Fails CLOSED -- an unconfigured secret returns 503 rather than
// leaving an endpoint open that can notify every admin.
const ESCALATE_AFTER_DAYS = 5

export async function GET(req) {
  const configuredSecret = process.env.CRON_SECRET
  if (!configuredSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  }
  const auth = req.headers.get("authorization") || ""
  if (auth !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - ESCALATE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Once-only: escalated_at IS NULL. A question that has been escalated is
  // never re-notified, however long it stays open -- daily nagging is exactly
  // the notification fatigue this app avoids elsewhere (cf. book-return).
  const { data: stale, error } = await supa
    .from("questions")
    .select("id, subject, context_type, context_key, asker_member_id, created_at")
    .eq("status", "open")
    .is("escalated_at", null)
    .lt("created_at", cutoff)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!stale?.length) return NextResponse.json({ ok: true, checked: 0, escalated: 0 })

  const adminIds = await getAdminIds()
  if (!adminIds.length) return NextResponse.json({ ok: true, checked: stale.length, escalated: 0 })

  const askerIds = [...new Set(stale.map(q => q.asker_member_id))]
  const { data: askers } = await supa.from("members").select("id, name").in("id", askerIds)
  const askerName = Object.fromEntries((askers || []).map(m => [m.id, m.name]))

  let escalated = 0
  for (const q of stale) {
    const label = await contextLabel(q.context_type, q.context_key)
    const who   = askerName[q.asker_member_id] || "A resident"
    const msg   = `Unanswered for ${ESCALATE_AFTER_DAYS} days -- ${who} asked ${label}: "${q.subject.slice(0, 80)}"`

    for (const adminId of adminIds) {
      // Don't escalate a question back to the person who asked it, even if
      // they're an admin -- they know it's unanswered, that's the problem.
      await notify(adminId, null, "question_unanswered", msg, "/questions", q.asker_member_id)
    }
    await supa.from("questions").update({ escalated_at: new Date().toISOString() }).eq("id", q.id)
    escalated++
  }

  return NextResponse.json({ ok: true, checked: stale.length, escalated })
}
