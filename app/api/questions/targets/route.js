import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { askableCategories, primaryAnswererIds, HUB_LABELS } from "@/lib/questionRouting"
import { displayRecipientName } from "@/lib/categoryQuestions"

// Powers Home's "Who would you like to ask?" picker in a single round-trip.
//
// Returns every target this member may address, each with the REAL names of
// who it reaches. Naming the recipients is the point (scope §8.1): the old
// copy said "it goes privately to the right contact", which told the resident
// nothing -- this community's mental model is people, not systems.
//
// A target with zero recipients is omitted entirely, so the picker can never
// offer a dead end. The same gate is enforced again on POST /api/questions --
// this endpoint decides what to SHOW, never what is allowed.
export const dynamic = "force-dynamic"

async function getMember(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "")
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return null
  const { data: m } = await supabaseAdmin
    .from("members").select("id, name, is_admin").eq("auth_id", user.id).single()
  return m || null
}

export async function GET(req) {
  const viewer = await getMember(req)
  if (!viewer) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  // ── Name resolution + privacy ────────────────────────────────────────────
  // Same masking as the Contacts list: a Private (hide_name) resident reads as
  // "Resident" to a non-admin, but always sees their own real name. Being a
  // category answerer is a role, not a licence to unmask.
  const { data: allMembers } = await supabaseAdmin
    .from("members").select("id, name, hide_name").eq("status", "active")
  const byId = Object.fromEntries((allMembers || []).map(m => [m.id, m]))

  const displayName = (id) => displayRecipientName(byId[id], viewer)

  // Excludes the viewer: you can't answer your own question (the POST route
  // already filters the asker out of the notify list), so listing yourself as
  // a recipient would be misleading.
  const build = (type, key, label, ids, hint) => {
    const names = [...new Set(ids.filter(id => id !== viewer.id && byId[id]))]
      .map(displayName).filter(Boolean)
    if (!names.length) return null
    return {
      context_type: type, context_key: key, label, hint: hint || null,
      recipient_names: names, recipient_count: names.length,
    }
  }

  const targets = []

  // 1. Askable contact categories first -- the new, most specific targets.
  for (const c of await askableCategories()) {
    const t = build("category", c.id, c.name, c.memberIds)
    if (t) targets.push(t)
  }

  // 2. Hubs.
  for (const hubKey of Object.keys(HUB_LABELS)) {
    const t = build("hub", hubKey, HUB_LABELS[hubKey], await primaryAnswererIds("hub", hubKey))
    if (t) targets.push(t)
  }

  // 3. Groups & clubs the viewer belongs to. Someone who isn't in a club has
  //    no reason to be asking its owners a question -- and a long list of
  //    every club in the community is exactly the noise this picker exists
  //    to remove.
  const { data: myClubs } = await supabaseAdmin
    .from("club_members").select("club_id").eq("member_id", viewer.id)
  const myClubIds = [...new Set((myClubs || []).map(r => String(r.club_id)))]
  if (myClubIds.length) {
    const { data: clubs } = await supabaseAdmin
      .from("clubs").select("id, name").in("id", myClubIds)
    for (const club of clubs || []) {
      const t = build("club", String(club.id), club.name, await primaryAnswererIds("club", String(club.id)))
      if (t) targets.push(t)
    }
  }

  // 4. Admins LAST, as the explicit catch-all. This target already existed as
  //    context_type 'general' -- it was just invisible: Home's Ask tile sent
  //    here silently and the resident had no idea who they were reaching.
  //    Listing it by name is the whole improvement (Iain, 2026-07-27).
  const adminTarget = build(
    "general", null, "Hive Admins",
    await primaryAnswererIds("general", null),
    "Anything else, or not sure who to ask",
  )
  if (adminTarget) targets.push(adminTarget)

  return NextResponse.json(targets)
}
