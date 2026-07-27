import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { askableCategories } from "@/lib/questionRouting"
import { displayRecipientName } from "@/lib/categoryQuestions"

// Powers Home's "Who would you like to ask?" picker.
//
// The list is deliberately just TWO kinds of thing (Iain, 2026-07-27):
//   1. Contact categories -- excluding Residents, and only those containing
//      someone who can actually answer (see askableCategories)
//   2. Hive Admins -- the catch-all, listed last
//
// Hubs and Groups & Clubs were removed after review: they made the list long
// and confusing, and every hub/club landing already carries its own Ask
// entry point (components/OwnersManager.js) where the context is obvious.
// Nothing was lost, the picker just stopped duplicating it.
//
// Recipient names are resolved but NOT shown in the list (vertical space) --
// they're used for the "Goes to ..." line on the compose step, where a single
// line tells the resident exactly who they're writing to.
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

  // Two parallel reads; askableCategories() is itself batched to four flat
  // queries. Previously this route issued ~15 sequential round-trips and took
  // roughly five seconds on a cold start.
  const [cats, { data: allMembers }] = await Promise.all([
    askableCategories(),
    supabaseAdmin.from("members").select("id, name, hide_name, is_admin").eq("status", "active"),
  ])
  const byId = Object.fromEntries((allMembers || []).map(m => [m.id, m]))

  // Excludes the viewer -- you can't answer your own question, so listing
  // yourself as a recipient would be misleading.
  const build = (type, key, label, ids, hint) => {
    const names = [...new Set(ids.filter(id => id !== viewer.id && byId[id]))]
      .map(id => displayRecipientName(byId[id], viewer)).filter(Boolean)
    if (!names.length) return null
    return {
      context_type: type, context_key: key, label, hint: hint || null,
      recipient_names: names, recipient_count: names.length,
    }
  }

  const targets = []
  for (const c of cats) {
    const t = build("category", c.id, c.name, c.memberIds)
    if (t) targets.push(t)
  }

  // Admins last, as the explicit catch-all. This target already existed as
  // context_type 'general' -- it was just invisible: Home's Ask tile sent here
  // silently and the resident had no idea who they were reaching.
  const adminTarget = build(
    "general", null, "Hive Admins",
    (allMembers || []).filter(m => m.is_admin).map(m => m.id),
    "Anything else, or not sure who to ask",
  )
  if (adminTarget) targets.push(adminTarget)

  return NextResponse.json(targets)
}
