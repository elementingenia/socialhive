import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import { STATUS, labelKey, normaliseLabel, validateLabel, reviewOutcomeMessage, sortByLabel } from "@/lib/interests"

// Admin > Interests (backlog B3, migration 120). Admins only (Q4).
//   GET  [?count=1]  -> pending queue + approved + retired, or just the
//                       pending count for the Admin badges
//   POST {label}     -> add an approved chip directly
//   PATCH {action, id, ...} -> approve | reject | merge | rename | retire | restore
// Residents hear back on approve/merge/reject with an in-app notification
// only, no push (Q3) -- those types are deliberately absent from PUSH_TYPES.
export const dynamic = "force-dynamic"

async function requireAdmin(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "")
  if (!token) return null
  const { data: { user } } = await supa.auth.getUser(token)
  if (!user) return null
  const { data } = await supa.from("members").select("id, is_admin").eq("auth_id", user.id).single()
  return data?.is_admin ? data : null
}

const LIVE = [STATUS.APPROVED, STATUS.PENDING, STATUS.RETIRED]

async function liveClash(label, exceptId) {
  const { data } = await supa.from("interest_tags").select("id, label, status").in("status", LIVE)
  const key = labelKey(label)
  return (data || []).find(t => t.id !== exceptId && labelKey(t.label) === key) || null
}

async function holders(tagId) {
  const { data } = await supa.from("member_interests").select("member_id").eq("tag_id", tagId)
  return (data || []).map(r => r.member_id)
}

export async function GET(req) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 })

  if (new URL(req.url).searchParams.get("count") === "1") {
    const { count } = await supa.from("interest_tags")
      .select("id", { count: "exact", head: true }).eq("status", STATUS.PENDING)
    return NextResponse.json({ pendingCount: count || 0 })
  }

  const [{ data: tags, error }, { data: links }] = await Promise.all([
    supa.from("interest_tags").select("id, label, status, suggested_by, created_at").in("status", LIVE),
    supa.from("member_interests").select("tag_id"),
  ])
  if (error) return NextResponse.json({ error: "Could not load interests." }, { status: 500 })

  const counts = {}
  for (const l of links || []) counts[l.tag_id] = (counts[l.tag_id] || 0) + 1

  const suggesterIds = [...new Set((tags || []).filter(t => t.status === STATUS.PENDING && t.suggested_by).map(t => t.suggested_by))]
  const { data: people } = suggesterIds.length
    ? await supa.from("members").select("id, name, display_name").in("id", suggesterIds)
    : { data: [] }
  const nameOf = Object.fromEntries((people || []).map(p => [p.id, p.display_name || p.name]))

  const shape = t => ({ id: t.id, label: t.label, count: counts[t.id] || 0 })
  const pending = (tags || []).filter(t => t.status === STATUS.PENDING)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(t => ({ ...shape(t), suggestedBy: nameOf[t.suggested_by] || null, createdAt: t.created_at }))

  return NextResponse.json({
    pending,
    approved: sortByLabel((tags || []).filter(t => t.status === STATUS.APPROVED).map(shape)),
    retired: sortByLabel((tags || []).filter(t => t.status === STATUS.RETIRED).map(shape)),
  })
}

export async function POST(req) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const err = validateLabel(body.label)
  if (err) return NextResponse.json({ error: err }, { status: 400 })
  const clash = await liveClash(body.label)
  if (clash) {
    const where = clash.status === STATUS.PENDING ? " It's waiting in the review queue -- approve it there."
      : clash.status === STATUS.RETIRED ? " It's retired -- restore it instead." : ""
    return NextResponse.json({ error: `"${clash.label}" already exists.${where}` }, { status: 409 })
  }
  const { error } = await supa.from("interest_tags").insert({
    label: normaliseLabel(body.label), status: STATUS.APPROVED,
    reviewed_by: admin.id, reviewed_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ error: "Could not add that interest." }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { action, id } = body
  if (!id) return NextResponse.json({ error: "Missing interest." }, { status: 400 })

  const { data: tag } = await supa.from("interest_tags").select("id, label, status").eq("id", id).maybeSingle()
  if (!tag) return NextResponse.json({ error: "That interest no longer exists." }, { status: 404 })
  const now = new Date().toISOString()
  const reviewed = { reviewed_by: admin.id, reviewed_at: now }

  if (action === "approve" || action === "reject") {
    if (tag.status !== STATUS.PENDING) return NextResponse.json({ error: "Already reviewed." }, { status: 409 })
    const who = await holders(tag.id)
    if (action === "approve") {
      const { error } = await supa.from("interest_tags").update({ status: STATUS.APPROVED, ...reviewed }).eq("id", tag.id)
      if (error) return NextResponse.json({ error: "Could not approve." }, { status: 500 })
    } else {
      await supa.from("member_interests").delete().eq("tag_id", tag.id)
      const { error } = await supa.from("interest_tags").update({ status: STATUS.REJECTED, ...reviewed }).eq("id", tag.id)
      if (error) return NextResponse.json({ error: "Could not reject." }, { status: 500 })
    }
    const kind = action === "approve" ? "approved" : "rejected"
    for (const m of who) await notify(m, null, `interest_${kind}`, reviewOutcomeMessage(kind, tag.label), null, admin.id)
    return NextResponse.json({ ok: true })
  }

  if (action === "merge") {
    if (tag.status !== STATUS.PENDING) return NextResponse.json({ error: "Only a pending suggestion can be merged." }, { status: 409 })
    const { data: target } = await supa.from("interest_tags").select("id, label, status").eq("id", body.target_id).maybeSingle()
    if (!target || target.status !== STATUS.APPROVED || target.id === tag.id) {
      return NextResponse.json({ error: "Choose an approved interest to merge into." }, { status: 400 })
    }
    const who = await holders(tag.id)
    const already = new Set(await holders(target.id))
    const add = who.filter(m => !already.has(m)).map(member_id => ({ member_id, tag_id: target.id }))
    if (add.length) {
      const { error } = await supa.from("member_interests").insert(add)
      if (error) return NextResponse.json({ error: "Could not merge." }, { status: 500 })
    }
    await supa.from("member_interests").delete().eq("tag_id", tag.id)
    await supa.from("interest_tags").update({ status: STATUS.MERGED, merged_into: target.id, ...reviewed }).eq("id", tag.id)
    for (const m of who) await notify(m, null, "interest_merged", reviewOutcomeMessage("merged", tag.label, target.label), null, admin.id)
    return NextResponse.json({ ok: true })
  }

  if (action === "rename") {
    const err = validateLabel(body.label)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
    const clash = await liveClash(body.label, tag.id)
    if (clash) return NextResponse.json({ error: `"${clash.label}" already exists.` }, { status: 409 })
    const { error } = await supa.from("interest_tags").update({ label: normaliseLabel(body.label) }).eq("id", tag.id)
    if (error) return NextResponse.json({ error: "Could not rename." }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === "retire" || action === "restore") {
    const from = action === "retire" ? STATUS.APPROVED : STATUS.RETIRED
    const to = action === "retire" ? STATUS.RETIRED : STATUS.APPROVED
    if (tag.status !== from) return NextResponse.json({ error: "That change doesn't apply to this interest." }, { status: 409 })
    const { error } = await supa.from("interest_tags").update({ status: to }).eq("id", tag.id)
    if (error) return NextResponse.json({ error: "Could not update." }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 })
}
