import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { notify } from "@/lib/notify"
import { canAnswer, primaryAnswererIds, contextLabel } from "@/lib/questionRouting"
import { resolveMemberName } from "@/lib/memberName"
import {
  readMessageRequest, prepareImages, storeImages, loadThreadImages,
  questionStoragePaths, removeStoragePaths,
} from "@/lib/questionImages"
import { hasContent, photoSuffix } from "@/lib/questionImageRules"

export const dynamic = "force-dynamic"

async function getMember(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "")
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return null
  const { data: m } = await supabaseAdmin.from("members").select("id, name, is_admin").eq("auth_id", user.id).single()
  return m || null
}

// viewer is the requesting member (id, is_admin) — needed here because
// asker_name/author are resolved to Display Name (or, for an admin/EC
// viewer, Real Name too) same two-tier rule as everywhere else (Iain,
// 2026-08-15): non-admins see Display Name only (or the masked fallback if
// the member is Private); admins additionally get the Real Name.
async function loadThread(id, viewer) {
  const { data: q } = await supabaseAdmin.from("questions").select("*").eq("id", id).single()
  if (!q) return null
  const { data: replies } = await supabaseAdmin.from("question_replies")
    .select("id, member_id, body, is_answer, created_at, members(name, display_name, hide_name)").eq("question_id", id)
    .order("created_at", { ascending: true })
  const { data: asker } = await supabaseAdmin.from("members")
    .select("name, display_name, hide_name").eq("id", q.asker_member_id).single()
  const label = await contextLabel(q.context_type, q.context_key)
  const askerName = resolveMemberName(asker, { viewerId: viewer?.id, canManage: !!viewer?.is_admin })
  return { q, replies: replies || [], askerName, label }
}

export async function GET(req, { params }) {
  const member = await getMember(req)
  if (!member) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  const t = await loadThread(params.id, member)
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isAsker = t.q.asker_member_id === member.id
  const mayAnswer = await canAnswer(member, t.q)
  if (!isAsker && !mayAnswer) return NextResponse.json({ error: "Not allowed" }, { status: 403 })

  // Asker opening the thread clears their "unseen answer" badge.
  if (isAsker && !t.q.asker_seen_at && (t.q.status === "answered" || t.q.status === "closed")) {
    await supabaseAdmin.from("questions").update({ asker_seen_at: new Date().toISOString() }).eq("id", t.q.id)
    t.q.asker_seen_at = new Date().toISOString()
  }

  const images = await loadThreadImages(t.q.id)

  return NextResponse.json({
    question: {
      id: t.q.id, subject: t.q.subject, body: t.q.body, status: t.q.status,
      context_type: t.q.context_type, context_label: t.label,
      asker_name: t.askerName, created_at: t.q.created_at,
      answered_at: t.q.answered_at,
      images: images.question,
    },
    replies: t.replies.map(r => ({
      id: r.id, body: r.body, is_answer: r.is_answer, created_at: r.created_at,
      images: images.replies[r.id] || [],
      author: resolveMemberName(r.members, {
        viewerId: member.id, canManage: !!member.is_admin,
        fallback: r.is_answer ? "Coordinator" : "Resident",
      }),
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
  // Photos live in Storage, which the row cascade can't reach -- remove the
  // files first, then the rows (cascades replies + question_images).
  await removeStoragePaths(await questionStoragePaths(params.id))
  await supabaseAdmin.from("questions").delete().eq("id", params.id)   // cascades replies
  return NextResponse.json({ ok: true })
}

export async function POST(req, { params }) {
  const member = await getMember(req)
  if (!member) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  // Multipart when photos are attached (up to 3 per reply), JSON otherwise.
  const { fields, files } = await readMessageRequest(req)
  const body = fields.body || ""
  if (!hasContent(body, files.length)) return NextResponse.json({ error: "Please add a message or a photo" }, { status: 400 })

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

  // Resize before writing anything, so a bad photo leaves no stray reply.
  const prep = await prepareImages(files)
  if (prep.error) return NextResponse.json({ error: prep.error }, { status: 400 })

  const { data: reply, error: replyErr } = await supabaseAdmin.from("question_replies").insert({
    question_id: q.id, member_id: member.id, body: body.trim(), is_answer,
  }).select("id").single()
  if (replyErr) return NextResponse.json({ error: "Could not send. Please try again." }, { status: 500 })

  const stored = await storeImages(prep.processed, { questionId: q.id, replyId: reply.id, memberId: member.id })
  if (stored.error) {
    // Roll back before any status change or notification has happened.
    await supabaseAdmin.from("question_replies").delete().eq("id", reply.id)
    return NextResponse.json({ error: stored.error }, { status: 500 })
  }

  const patch = { status: newStatus, updated_at: now }
  if (is_answer) {
    // A new answerer reply → asker has unseen activity again; record first answerer.
    patch.asker_seen_at = null
    if (!q.answered_at) { patch.answered_at = now; patch.answered_by = member.id }
  }
  await supabaseAdmin.from("questions").update(patch).eq("id", q.id)

  // Subject included in the reply notification (2026-08-15, Iain) -- the
  // "New question" notification below always named the actual topic
  // ("New question about Dinner Club: \"Booze\""), but the reply
  // notification only ever carried the context label ("New reply on a
  // question about Dinner Club"), with no way to tell which of possibly
  // several open threads in that context it was. Matches the same
  // subject.trim().slice(0, 80) truncation used at creation (POST /api/questions).
  const subject = q.subject?.trim().slice(0, 80) || ""
  const photos = photoSuffix(prep.processed.length)
  for (const id of notifyTargets) {
    const msg = notifyType === "question_answered"
      ? `Your question about ${label} has a new reply: "${subject}"${photos}`
      : `New reply on a question about ${label}: "${subject}"${photos}`
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
