import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { requireSwapMember } from "@/lib/swapServer"

export const dynamic = "force-dynamic"

// POST -- a Private resident tapped OK on the one-time note that their
// display name is shown in Swap & Sell. Recorded once; never shown again.
export async function POST(req) {
  const ctx = await requireSwapMember(req)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  if (!ctx.member.swap_privacy_ack_at) {
    const { error } = await supa.from("members").update({ swap_privacy_ack_at: new Date().toISOString() }).eq("id", ctx.member.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
