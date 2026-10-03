import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { STATUS, buildDirectory } from "@/lib/interests"
import { maskMemberRow } from "@/lib/directoryPrivacy"
import { withStreetNames } from "@/lib/streetsServer"

// Info > Contacts "Ask me about" lines + search (backlog B3). Returns
// { member_id: ["Bridge", "Gardening"] } for approved chips (directory)
// plus unapproved suggestions (pending, Info > Interests only).
// Private (hide_name) residents are stripped HERE, server-side, for every
// viewer including admins and the resident themself (D2) -- nothing about a
// Private resident's interests ever reaches the browser.
export const dynamic = "force-dynamic"

export async function GET(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: { user } } = await supa.auth.getUser(token)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: viewer } = await supa.from("members").select("id, is_admin").eq("auth_id", user.id).maybeSingle()
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [{ data: tags, error: e1 }, { data: links, error: e2 }] = await Promise.all([
    supa.from("interest_tags").select("id, label, status").in("status", [STATUS.APPROVED, STATUS.PENDING]),
    supa.from("member_interests").select("member_id, tag_id"),
  ])
  if (e1 || e2) return NextResponse.json({ error: "Could not load interests." }, { status: 500 })

  const memberIds = [...new Set((links || []).map(l => l.member_id))]
  const { data: members, error: e3 } = memberIds.length
    ? await supa.from("members").select("id, status, is_test, hide_name, name, display_name, house_number, street_id, phone").in("id", memberIds)
    : { data: [] }
  if (e3) return NextResponse.json({ error: "Could not load interests." }, { status: 500 })

  // directory = approved only (Contacts cards + search, unchanged).
  // pending = unapproved suggestions, used ONLY by Info > Interests, where
  // Iain (2026-10-03) wants them visible in amber and usable before review.
  // Private/test/inactive residents are stripped from both.
  const directory = buildDirectory(members, links, tags)
  const pending = buildDirectory(members, links, tags, STATUS.PENDING)
  // people (BUG-072): the name/house/phone Info > Interests shows for each
  // listed resident. The page used to read these straight from members in
  // the browser; migration 121 blocks that. Only residents who actually
  // appear in directory/pending are sent (Private ones never do), and
  // maskMemberRow is applied anyway as a second guard.
  const listed = new Set([...Object.keys(directory || {}), ...Object.keys(pending || {})])
  const people = {}
  for (const m of await withStreetNames(supa, members || [])) {
    if (!listed.has(m.id) || m.status !== "active" || m.is_test) continue
    const r = maskMemberRow(m, viewer)
    if (r.masked) continue
    people[m.id] = { id: r.id, name: r.name, display_name: r.display_name, house_number: r.house_number, street_name: r.street_name, phone: r.phone, hide_name: r.hide_name }
  }
  return NextResponse.json({ directory, pending, people })
}
