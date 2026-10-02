import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { STATUS, MAX_INTERESTS, resolveSuggestion, validateSelection, sortByLabel } from "@/lib/interests"

// Resident side of "Ask me about..." (backlog B3, migration 120).
//   GET  -> approved chip list + my own picks (incl. my pending suggestions)
//   PUT  -> replace my picks (Profile "Save")
//   POST -> suggest a new chip (sent straight away; becomes pending)
// interest_tags/member_interests are service-role only (RLS, no policies),
// so every access goes through here.
export const dynamic = "force-dynamic"

async function getMember(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "")
  if (!token) return null
  const { data: { user } } = await supa.auth.getUser(token)
  if (!user) return null
  const { data } = await supa.from("members")
    .select("id, hide_name, status").eq("auth_id", user.id).single()
  return data?.status === "active" ? data : null
}

const PRIVATE_LOCKED = "Your interests are locked while 'Hide my name' is on."

async function myPicks(memberId) {
  const { data } = await supa.from("member_interests")
    .select("tag:interest_tags!tag_id(id, label, status)").eq("member_id", memberId)
  // Only chips the resident can still act on: approved, or a pending
  // suggestion they're attached to. Retired picks are kept in the DB (in case
  // an admin restores the chip) but aren't shown.
  return sortByLabel((data || []).map(r => r.tag)
    .filter(t => t && (t.status === STATUS.APPROVED || t.status === STATUS.PENDING)))
}

export async function GET(req) {
  const me = await getMember(req)
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: tags, error } = await supa.from("interest_tags")
    .select("id, label").eq("status", STATUS.APPROVED)
  if (error) return NextResponse.json({ error: "Could not load interests." }, { status: 500 })
  return NextResponse.json({
    tags: sortByLabel(tags || []),
    mine: await myPicks(me.id),
    locked: !!me.hide_name,
    max: MAX_INTERESTS,
  })
}

export async function PUT(req) {
  const me = await getMember(req)
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (me.hide_name) return NextResponse.json({ error: PRIVATE_LOCKED }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { data: currentRows } = await supa.from("member_interests").select("tag_id").eq("member_id", me.id)
  const currentIds = (currentRows || []).map(r => r.tag_id)
  const requested = Array.isArray(body.tag_ids) ? body.tag_ids : null
  if (!requested) return NextResponse.json({ error: "Invalid selection." }, { status: 400 })

  const lookupIds = [...new Set(requested.filter(x => typeof x === "string"))]
  const { data: tagRows } = lookupIds.length
    ? await supa.from("interest_tags").select("id, label, status").in("id", lookupIds)
    : { data: [] }
  const v = validateSelection(requested, new Map((tagRows || []).map(t => [t.id, t])), currentIds)
  if (v.error) return NextResponse.json({ error: v.error }, { status: 400 })

  // Only touch chips the resident can see. Retired picks stay put (restorable).
  const { data: visibleRows } = currentIds.length
    ? await supa.from("interest_tags").select("id, status").in("id", currentIds)
    : { data: [] }
  const editable = new Set((visibleRows || [])
    .filter(t => t.status === STATUS.APPROVED || t.status === STATUS.PENDING).map(t => t.id))
  const keep = new Set(v.ids)
  const toRemove = currentIds.filter(id => editable.has(id) && !keep.has(id))
  const toAdd = v.ids.filter(id => !currentIds.includes(id))

  if (toRemove.length) {
    await supa.from("member_interests").delete().eq("member_id", me.id).in("tag_id", toRemove)
    // A pending suggestion nobody holds any more is withdrawn, so admins
    // don't review something no-one wants.
    const pendingRemoved = (visibleRows || []).filter(t => toRemove.includes(t.id) && t.status === STATUS.PENDING).map(t => t.id)
    for (const id of pendingRemoved) {
      const { count } = await supa.from("member_interests").select("member_id", { count: "exact", head: true }).eq("tag_id", id)
      if (!count) await supa.from("interest_tags").delete().eq("id", id).eq("status", STATUS.PENDING)
    }
  }
  if (toAdd.length) {
    const { error } = await supa.from("member_interests")
      .insert(toAdd.map(tag_id => ({ member_id: me.id, tag_id })))
    if (error) return NextResponse.json({ error: "Could not save your interests." }, { status: 500 })
  }
  return NextResponse.json({ ok: true, mine: await myPicks(me.id) })
}

export async function POST(req) {
  const me = await getMember(req)
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (me.hide_name) return NextResponse.json({ error: PRIVATE_LOCKED }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  // Retired chips included so a suggestion matching one is refused cleanly
  // instead of tripping the live-label unique index (500).
  const { data: live } = await supa.from("interest_tags")
    .select("id, label, status").in("status", [STATUS.APPROVED, STATUS.PENDING, STATUS.RETIRED])
  const r = resolveSuggestion(body.label, live || [])
  if (r.action === "error" || r.action === "unavailable") return NextResponse.json({ error: r.error }, { status: 400 })

  const { data: currentRows } = await supa.from("member_interests").select("tag_id").eq("member_id", me.id)
  const current = (currentRows || []).map(x => x.tag_id)

  let tag = r.tag
  if (tag && current.includes(tag.id)) {
    return NextResponse.json({ ok: true, outcome: "already", tag, mine: await myPicks(me.id) })
  }
  // Cap counts what the resident can see (approved + pending).
  const visibleCount = (await myPicks(me.id)).length
  if (visibleCount >= MAX_INTERESTS) {
    return NextResponse.json({ error: `You can choose up to ${MAX_INTERESTS}. Untick one first.` }, { status: 400 })
  }

  if (r.action === "create") {
    const { data: created, error } = await supa.from("interest_tags")
      .insert({ label: r.label, status: STATUS.PENDING, suggested_by: me.id })
      .select("id, label, status").single()
    if (error) {
      // Lost a race with someone suggesting the same words: join theirs.
      const { data: again } = await supa.from("interest_tags")
        .select("id, label, status").in("status", [STATUS.APPROVED, STATUS.PENDING])
      const r2 = resolveSuggestion(r.label, again || [])
      if (!r2.tag || r2.action === "unavailable") return NextResponse.json({ error: "Could not save that suggestion." }, { status: 500 })
      tag = r2.tag
    } else {
      tag = created
    }
  }

  const { error: linkErr } = await supa.from("member_interests").insert({ member_id: me.id, tag_id: tag.id })
  if (linkErr && linkErr.code !== "23505") {
    return NextResponse.json({ error: "Could not save that suggestion." }, { status: 500 })
  }
  const outcome = tag.status === STATUS.APPROVED ? "selected" : (r.action === "create" ? "suggested" : "joined")
  return NextResponse.json({ ok: true, outcome, tag, mine: await myPicks(me.id) })
}
