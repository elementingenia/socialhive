import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { requireSwapAdmin, membersById } from "@/lib/swapServer"
import { swapName, MAX_REPORT_REASON } from "@/lib/swap"

export const dynamic = "force-dynamic"

// Admin: residents stopped from creating listings. A block doesn't remove
// their existing listings -- hide those separately if needed.

export async function GET(req) {
  const ctx = await requireSwapAdmin(req)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { data } = await supa.from("swap_blocks").select("member_id, reason, created_at").order("created_at", { ascending: false })
  const people = await membersById((data || []).map(b => b.member_id))
  return NextResponse.json({ blocks: (data || []).map(b => ({ ...b, name: swapName(people[b.member_id]) })) })
}

export async function POST(req) {
  const ctx = await requireSwapAdmin(req)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { member_id, reason } = await req.json().catch(() => ({}))
  if (!member_id) return NextResponse.json({ error: "member_id required" }, { status: 400 })
  if (member_id === ctx.member.id) return NextResponse.json({ error: "You can't block yourself" }, { status: 400 })
  const { error } = await supa.from("swap_blocks").upsert({
    member_id, blocked_by: ctx.member.id,
    reason: typeof reason === "string" && reason.trim() ? reason.trim().slice(0, MAX_REPORT_REASON) : null,
  }, { onConflict: "member_id" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req) {
  const ctx = await requireSwapAdmin(req)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { member_id } = await req.json().catch(() => ({}))
  if (!member_id) return NextResponse.json({ error: "member_id required" }, { status: 400 })
  const { error } = await supa.from("swap_blocks").delete().eq("member_id", member_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
