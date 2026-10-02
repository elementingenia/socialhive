import { NextResponse } from "next/server"
import { resolveMember } from "@/lib/areaAuth"
import { gatherDigest, pendingInvites } from "@/lib/digestData"
import { resolveMemberName } from "@/lib/memberName"
import { eventDeepLink } from "@/lib/eventNav"

export const dynamic = "force-dynamic"

// GET /api/digest -- the Digest page's content for the signed-in resident.
// Events themselves are fetched by the page from /api/events (same data and
// tile style as Calendar); this returns everything else, plus this
// resident's own unbooked invites.
export async function GET(req) {
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })

  const digest = await gatherDigest()
  const invitesMap = await pendingInvites([member.id])
  const invites = (invitesMap.get(member.id) || []).map(r => ({
    id: r.id,
    from_name: resolveMemberName(r.from, { viewerId: member.id, canManage: !!member.is_admin, fallback: "A neighbour" }),
    event: { id: r.event.id, title: r.event.title, event_date: r.event.event_date, event_time: r.event.event_time },
    url: eventDeepLink({ hubType: r.event.hub_type, eventId: r.event.id, clubId: r.event.club_id, clubSlug: r.event.club?.slug }),
  }))

  return NextResponse.json({ ...digest, invites })
}
