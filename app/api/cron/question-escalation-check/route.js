import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import { contextLabel, getAdminIds, primaryAnswererIds, escalationOwnerIds } from "@/lib/questionRouting"
import { ESCALATE_AFTER_DAYS, ownerTierIds, escalationStep, escalationMessage } from "@/lib/questionEscalation"

// Reads back its own just-written escalation timestamps on the next run, so it
// must never be served stale -- force-dynamic + the shared no-store
// supabaseAdmin client. Same class of bug as the 2026-07-15
// book_return_reminded_at issue.
export const dynamic = "force-dynamic"

// Daily safety net for questions nobody has answered (Iain approved
// 2026-07-27; scope §8.4). Applies to every context type.
//
// Two steps since 2026-10-26 (Iain), rules in lib/questionEscalation.js:
//   day 5  -> the event's parent club/hub Owner(s), if anyone there wasn't
//             already asked (owner_escalated_at, migration 144)
//   +5 days, or day 5 when there is no Owner tier -> every admin (escalated_at)
// Before this, an event question went from its coordinator straight to every
// admin, skipping the club's Owner (a Craft & Coffee sewing question reached
// all 9 admins, Owner never told).
//
// escalated_at still means "admins told": once set, answeringBoxQuestions()
// puts the question in every admin's "To answer" box regardless of routing
// (BUG-052). An Owner already sees event questions for their club/hub there.
//
// Auth: Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron-triggered
// requests. Fails CLOSED -- an unconfigured secret returns 503 rather than
// leaving an endpoint open that can notify every admin.

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
  const cutoff = new Date(now.getTime() - ESCALATE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Once-only per step: escalated_at IS NULL. A question already sent to the
  // admins is never re-notified, however long it stays open.
  const { data: stale, error } = await supa
    .from("questions")
    .select("id, subject, status, context_type, context_key, asker_member_id, created_at, owner_escalated_at, escalated_at")
    .eq("status", "open")
    .is("escalated_at", null)
    .lt("created_at", cutoff)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!stale?.length) return NextResponse.json({ ok: true, checked: 0, owner: 0, admin: 0 })

  const askerIds = [...new Set(stale.map(q => q.asker_member_id))]
  const { data: askers } = await supa.from("members").select("id, name").in("id", askerIds)
  const askerName = Object.fromEntries((askers || []).map(m => [m.id, m.name]))

  let adminIds = null
  let ownerCount = 0, adminCount = 0
  for (const q of stale) {
    let tier = []
    if (!q.owner_escalated_at) {
      const [owners, primary] = await Promise.all([
        escalationOwnerIds(q.context_type, q.context_key),
        primaryAnswererIds(q.context_type, q.context_key),
      ])
      tier = ownerTierIds(owners, primary, q.asker_member_id)
    }
    const step = escalationStep(q, tier, now)
    if (!step) continue

    const label = await contextLabel(q.context_type, q.context_key)
    const who   = askerName[q.asker_member_id] || "A resident"
    const msg   = escalationMessage(q, who, label, now)

    if (step === "owner") {
      for (const id of tier) {
        await notify(id, null, "question_unanswered", msg, "/questions", q.asker_member_id)
      }
      await supa.from("questions").update({ owner_escalated_at: now.toISOString() }).eq("id", q.id)
      ownerCount++
      continue
    }

    if (adminIds === null) adminIds = await getAdminIds()
    if (!adminIds.length) continue
    for (const adminId of adminIds) {
      // notify()'s last arg skips the asker -- they know it's unanswered.
      await notify(adminId, null, "question_unanswered", msg, "/questions", q.asker_member_id)
    }
    await supa.from("questions").update({ escalated_at: now.toISOString() }).eq("id", q.id)
    adminCount++
  }

  return NextResponse.json({ ok: true, checked: stale.length, owner: ownerCount, admin: adminCount })
}
