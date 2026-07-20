import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { notify } from "@/lib/notify"
import { canAnswer, primaryAnswererIds, contextLabel } from "@/lib/questionRouting"

export const dynamic = "force-dynamic"

async function getMember(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "")
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return null
  const { data: m } = await supabaseAdmin.from("members").select("id, name, is_admin").eq("auth_id", user.id).single()
  return m || null
}

async function loadThread(id) {
  const { data: q } = await supabaseAdmin.from("questions").select("*").eq("id", id).single()
  if (!q) return null
  const { data: replies } = await supabaseAdmin.from("question_replies")
    .select("id, member_id, body, is_answer, created_at, members(name)").eq("question_id", id)
    .order("created_at", { ascending: true })
  const { data: asker } = await supabaseAdmin.from("members").select("name").eq("id", q.asker_member_id).single()
  const label = await contextLabel(q.context_type, q.context_key)
  return { q, replies: replies || [], askerName: asker?.name || "Resident", label }
}

export async function GET(req, { params }) {
  const member = await getMember(req)
  if (!member) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  const t = await loadThread(params.id)
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isAsker = t.q.asker_member_id === member.id
  const mayAnswer = await canAnswer(member, t.q)
  if (!isAsker && !mayAnswer) return NextResponse.json({ error: "Not allowed" }, { status: 403 })

  // Asker opening the thread clears their "unseen answer" badge.
  if (isAsker && !t.q.asker_seen_at && (t.q.status === "answered" || t.q.status === "closed")) {
    await supabaseAdmin.from("questions").update({ asker_seen_at: new Date().toISOString() }).eq("id", t.q.id)
    t.q.asker_seen_at = new Date().toISOString()
  }

  return NextResponse.json({
    question: {
      id: t.q.id, subject: t.q.subject, body: t.q.body, status: t.q.status,
      context_type: t.q.context_type, context_label: t.label,
      asker_name: t.askerName, created_at: t.q.created_at,
      answered_at: t.q.answered_at,
    },
    replies: t.replies.map(r => ({
      id: r.id, body: r.body, is_answer: r.is_answer, created_at: r.created_at,
      author: r.members?.name || (r.is_answer ? "Coordinator" : "Resident"),
    })),
    isAsker, canAnswer: mayAnswer,
    // What THIS viewer can do next given the bounded lifecycle:
    canReply:
      (t.q.status === "open"     && mayAnswer && !isAsker) ||
      (t.q.status === "answered" && isAsker) ||
      (t.q.status === "followup" && mayAnswer && !isAsker),
  })
}

export async function DELETE(req, { params }) {
  const member = await getMember(req)
  if (!member) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  const { data: q } = await supabaseAdmin.from("questions").select("asker_member_id").eq("id", params.id).single()
  if (!q) return NextResponse.json({ ok: true })   // already gone
  // Only the person who asked it (withdraw) or an admin (cleanup) may delete.
  if (q.asker_member_id !== member.id && !member.is_admin)
    return NextResponse.json({ error: "Not allowed" }, { status: 403 })
  await supabaseAdmin.from("questions").delete().eq("id", params.id)   // cascades replies
  return NextResponse.json({ ok: true })
}

export async function POST(req, { params }) {
  const member = await getMember(req)
  if (!member) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  const { body } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: "Message is required" }, { status: 400 })

  const { data: q } = await supabaseAdmin.from("questions").select("*").eq("id", params.id).single()
  if (!q) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isAsker = q.asker_member_id === member.id
  const mayAnswer = await canAnswer(member, q)
  if (!isAsker && !mayAnswer) return NextResponse.json({ error: "Not allowed" }, { status: 403 })

  const now = new Date().toISOString()
  let is_answer, newStatus, notifyType, notifyTargets = []
  const label = await contextLabel(q.context_type, q.context_key)

  if (q.status === "open") {
    if (!mayAnswer || isAsker) return NextResponse.json({ error: "This question is awaiting an answer." }, { status: 409 })
    is_answer = true; newStatus = "answered"
    notifyType = "question_answered"; notifyTargets = [q.asker_member_id]
  } else if (q.status === "answered") {
    if (!isAsker) return NextResponse.json({ error: "Answered — waiting on the asker." }, { status: 409 })
    is_answer = false; newStatus = "followup"
    notifyType = "question_received"
    notifyTargets = (await primaryAnswererIds(q.context_type, q.context_key)).filter(id => id !== member.id)
  } else if (q.status === "followup") {
    if (!mayAnswer || isAsker) return NextResponse.json({ error: "This follow-up is awaiting a reply." }, { status: 409 })
    is_answer = true; newStatus = "closed"
    notifyType = "question_answered"; notifyTargets = [q.asker_member_id]
  } else {
    return NextResponse.json({ error: "This question is closed." }, { status: 409 })
  }

  await supabaseAdmin.from("question_replies").insert({
    question_id: q.id, member_id: member.id, body: body.trim(), is_answer,
  })

  const patch = { status: newStatus, updated_at: now }
  if (is_answer) {
    // A new answerer reply → asker has unseen activity again; record first answerer.
    patch.asker_seen_at = null
    if (!q.answered_at) { patch.answered_at = now; patch.answered_by = member.id }
  }
  await supabaseAdmin.from("questions").update(patch).eq("id", q.id)

  for (const id of notifyTargets) {
    const msg = notifyType === "question_answered"
      ? `Your question about ${label} has ${newStatus === "closed" ? "an update" : "an answer"}.`
      : `Follow-up on a question about ${label}.`
    await notify(id, null, notifyType, msg, "/questions")
  }

  return NextResponse.json({ ok: true, status: newStatus })
}
