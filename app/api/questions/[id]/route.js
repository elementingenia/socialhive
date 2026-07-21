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
    // Open-ended conversation (Iain, 2026-07-21): either party may keep replying
    // until someone finalises it. Only "closed" stops the exchange.
    canReply: t.q.status !== "closed" && (isAsker || mayAnswer),
    canFinalise: t.q.status !== "closed" && (isAsker || mayAnswer),
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

  // Open-ended exchange (Iain, 2026-07-21). The old bounded lifecycle
  // (one answer -> one follow-up -> auto-close) proved too restrictive in real
  // use. Either party may now keep replying until someone finalises the chat.
  // Statuses: open = never answered (sits in the answerers' queue);
  // answered = live conversation; closed = finalised. Legacy "followup" rows
  // are normalised to "answered" on their next reply.
  if (q.status === "closed") {
    return NextResponse.json({ error: "This conversation has been finalised." }, { status: 409 })
  }

  // Status now tracks WHOSE TURN it is, not how many messages are left:
  //   open      = never answered yet        -> answerers' queue
  //   answered  = answerer replied last     -> asker's turn
  //   followup  = asker replied last        -> answerers' turn
  // so the "To answer" queue and unseen badges keep working, with no cap.
  is_answer = !isAsker
  newStatus = is_answer ? "answered" : (q.status === "open" ? "open" : "followup")

  if (is_answer) {
    notifyType = "question_answered"; notifyTargets = [q.asker_member_id]
  } else {
    notifyType = "question_received"
    notifyTargets = (await primaryAnswererIds(q.context_type, q.context_key)).filter(id => id !== member.id)
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
      ? `Your question about ${label} has a new reply.`
      : `New reply on a question about ${label}.`
    await notify(id, null, notifyType, msg, "/questions", member.id)
  }

  return NextResponse.json({ ok: true, status: newStatus })
}

// Finalise the conversation — available to EITHER party (asker or an eligible
// answerer), replacing the old automatic close. Idempotent. Deliberately does
// NOT notify: finalising is housekeeping, and the drawer is already busy.
export async function PATCH(req, { params }) {
  const member = await getMember(req)
  if (!member) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  const { data: q } = await supabaseAdmin.from("questions").select("*").eq("id", params.id).single()
  if (!q) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isAsker = q.asker_member_id === member.id
  const mayAnswer = await canAnswer(member, q)
  if (!isAsker && !mayAnswer && !member.is_admin) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 })
  }

  if (q.status !== "closed") {
    await supabaseAdmin.from("questions")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("id", q.id)
  }
  return NextResponse.json({ ok: true, status: "closed" })
}
