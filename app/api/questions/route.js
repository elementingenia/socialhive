import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { notify } from "@/lib/notify"
import {
  primaryAnswererIds, contextLabel, answeringBoxQuestions, HUB_LABELS,
} from "@/lib/questionRouting"

export const dynamic = "force-dynamic"

async function getMember(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "")
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return null
  const { data: m } = await supabaseAdmin.from("members").select("id, name, is_admin").eq("auth_id", user.id).single()
  return m || null
}

// Attach asker name, a human context label, and reply summary to a list of rows.
async function enrich(rows) {
  if (!rows.length) return []
  const askerIds = [...new Set(rows.map(r => r.asker_member_id))]
  const clubIds  = [...new Set(rows.filter(r => r.context_type === "club").map(r => r.context_key))]
  const eventIds = [...new Set(rows.filter(r => r.context_type === "event").map(r => r.context_key))]
  const qIds     = rows.map(r => r.id)

  const [{ data: askers }, { data: clubs }, { data: events }, { data: replies }] = await Promise.all([
    supabaseAdmin.from("members").select("id, name").in("id", askerIds),
    clubIds.length  ? supabaseAdmin.from("clubs").select("id, name").in("id", clubIds)       : Promise.resolve({ data: [] }),
    eventIds.length ? supabaseAdmin.from("events").select("id, title").in("id", eventIds)     : Promise.resolve({ data: [] }),
    supabaseAdmin.from("question_replies").select("question_id, created_at").in("question_id", qIds),
  ])
  const askerName = Object.fromEntries((askers || []).map(m => [m.id, m.name]))
  const clubName  = Object.fromEntries((clubs  || []).map(c => [c.id, c.name]))
  const eventName = Object.fromEntries((events || []).map(e => [e.id, e.title]))
  const replyAgg  = {}
  for (const r of replies || []) {
    const a = replyAgg[r.question_id] || { count: 0, last: null }
    a.count += 1
    if (!a.last || r.created_at > a.last) a.last = r.created_at
    replyAgg[r.question_id] = a
  }

  const label = (r) =>
    r.context_type === "general" ? "the Hive" :
    r.context_type === "hub"     ? (HUB_LABELS[r.context_key] || "a hub") :
    r.context_type === "club"    ? (clubName[r.context_key] || "a club") :
    r.context_type === "event"   ? (eventName[r.context_key] || "an event") : "the Hive"

  return rows.map(r => ({
    id: r.id, subject: r.subject, status: r.status,
    context_type: r.context_type, context_key: r.context_key, context_label: label(r),
    asker_name: askerName[r.asker_member_id] || "Resident",
    answered_by: r.answered_by, answered_at: r.answered_at,
    asker_seen_at: r.asker_seen_at,
    created_at: r.created_at, updated_at: r.updated_at,
    reply_count: replyAgg[r.id]?.count || 0,
    last_reply_at: replyAgg[r.id]?.last || null,
  }))
}

export async function GET(req) {
  const member = await getMember(req)
  if (!member) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  const { searchParams } = new URL(req.url)

  // Badge count: things needing my attention (as answerer + as asker).
  if (searchParams.get("count")) {
    const box = await answeringBoxQuestions(member)
    const toAnswer = box.filter(q => q.status === "open" || q.status === "followup").length
    const { data: mine } = await supabaseAdmin.from("questions")
      .select("id, status, asker_seen_at").eq("asker_member_id", member.id)
    const mineUnseen = (mine || []).filter(q => (q.status === "answered" || q.status === "closed") && !q.asker_seen_at).length
    return NextResponse.json({ count: toAnswer + mineUnseen, toAnswer, mineUnseen })
  }

  const box = searchParams.get("box") || "mine"
  if (box === "answering") {
    const rows = await answeringBoxQuestions(member)
    return NextResponse.json(await enrich(rows))
  }
  // mine
  const { data: rows } = await supabaseAdmin.from("questions")
    .select("*").eq("asker_member_id", member.id).order("updated_at", { ascending: false })
  return NextResponse.json(await enrich(rows || []))
}

export async function POST(req) {
  const member = await getMember(req)
  if (!member) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  const { context_type, context_key, subject, body } = await req.json()
  if (!["general", "hub", "club", "event"].includes(context_type))
    return NextResponse.json({ error: "Invalid context" }, { status: 400 })
  if (context_type !== "general" && !context_key)
    return NextResponse.json({ error: "Missing context" }, { status: 400 })
  if (!subject?.trim() || !body?.trim())
    return NextResponse.json({ error: "A subject and a message are required" }, { status: 400 })

  const key = context_type === "general" ? null : String(context_key)
  const { data: q, error } = await supabaseAdmin.from("questions").insert({
    asker_member_id: member.id, context_type, context_key: key,
    subject: subject.trim().slice(0, 200), body: body.trim(), status: "open",
  }).select("id").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify the answerer(s) for this context (excluding the asker).
  const answerers = (await primaryAnswererIds(context_type, key)).filter(id => id !== member.id)
  const label = await contextLabel(context_type, key)
  for (const id of answerers) {
    await notify(id, null, "question_received", `New question about ${label}: "${subject.trim().slice(0, 80)}"`, "/questions")
  }
  return NextResponse.json({ id: q.id })
}
