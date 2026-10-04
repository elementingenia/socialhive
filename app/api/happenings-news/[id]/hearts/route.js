import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { resolveMember, requireEventManage } from "@/lib/areaAuth"
import { canSeeHeartNames } from "@/lib/happeningsNewsHearts"
import { resolveMemberName } from "@/lib/memberName"
import { byOwnThenName } from "@/lib/sortNames"

export const dynamic = "force-dynamic"

// Hearts on a Happenings News post (Iain, 2026-10-05). Positive-only, no
// notification of any kind (Iain: "No notification").

async function heartCount(postId) {
  const { count } = await supa.from("happenings_news_hearts")
    .select("post_id", { count: "exact", head: true }).eq("post_id", postId)
  return count || 0
}

// POST { hearted: true|false } -- set (not toggle) this resident's heart, so
// a double tap or a retried request can't flip it back by accident. Any
// signed-in resident.
export async function POST(req, { params }) {
  const { id } = await params
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })

  const body = await req.json().catch(() => ({}))
  if (typeof body.hearted !== "boolean") return NextResponse.json({ error: "hearted must be true or false" }, { status: 400 })

  const { data: post } = await supa.from("happenings_news_posts").select("id").eq("id", id).maybeSingle()
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 })

  const q = body.hearted
    ? supa.from("happenings_news_hearts").upsert({ post_id: id, member_id: member.id }, { onConflict: "post_id,member_id", ignoreDuplicates: true })
    : supa.from("happenings_news_hearts").delete().eq("post_id", id).eq("member_id", member.id)
  const { error: wErr } = await q
  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, hearted: body.hearted, heart_count: await heartCount(id) })
}

// GET -- names of everyone who hearted. Post author, admins and the event's
// Owner/EC only (Iain: "its for a select group, not broadcast wide"). These
// viewers are all privileged for this event, so Private residents show their
// real name with "(P)", matching the app's attendee-list convention.
export async function GET(req, { params }) {
  const { id } = await params
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })

  const { data: post } = await supa.from("happenings_news_posts").select("id, event_id, member_id").eq("id", id).maybeSingle()
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 })

  let allowed = canSeeHeartNames({ viewerId: member.id, isAdmin: member.is_admin, posterId: post.member_id, canManageEvent: false })
  if (!allowed) allowed = !(await requireEventManage(req, post.event_id)).error
  if (!allowed) return NextResponse.json({ error: "Only the author, admins and this event's Owner or coordinator can see who hearted" }, { status: 403 })

  const { data: rows, error: rErr } = await supa.from("happenings_news_hearts")
    .select("member_id, created_at, members(id, name, display_name, hide_name, is_test)")
    .eq("post_id", id)
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })

  const people = (rows || [])
    .filter(r => r.members && !r.members.is_test)
    .map(r => ({
      member_id: r.member_id,
      name: resolveMemberName(r.members, { viewerId: member.id, canManage: true, selfLabel: "You" }),
      is_private: !!r.members.hide_name,
      is_own: r.member_id === member.id,
    }))
    .sort((a, b) => byOwnThenName(a.is_own, b.is_own, a.name, b.name))

  return NextResponse.json({ people })
}
