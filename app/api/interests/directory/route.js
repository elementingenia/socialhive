import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { STATUS, buildDirectory } from "@/lib/interests"

// Info > Contacts "Ask me about" lines + search (backlog B3). Returns
// { member_id: ["Bridge", "Gardening"] } for approved chips only.
// Private (hide_name) residents are stripped HERE, server-side, for every
// viewer including admins and the resident themself (D2) -- nothing about a
// Private resident's interests ever reaches the browser.
export const dynamic = "force-dynamic"

export async function GET(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: { user } } = await supa.auth.getUser(token)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [{ data: tags, error: e1 }, { data: links, error: e2 }] = await Promise.all([
    supa.from("interest_tags").select("id, label, status").eq("status", STATUS.APPROVED),
    supa.from("member_interests").select("member_id, tag_id"),
  ])
  if (e1 || e2) return NextResponse.json({ error: "Could not load interests." }, { status: 500 })

  const memberIds = [...new Set((links || []).map(l => l.member_id))]
  const { data: members, error: e3 } = memberIds.length
    ? await supa.from("members").select("id, status, is_test, hide_name").in("id", memberIds)
    : { data: [] }
  if (e3) return NextResponse.json({ error: "Could not load interests." }, { status: 500 })

  return NextResponse.json({ directory: buildDirectory(members, links, tags) })
}
