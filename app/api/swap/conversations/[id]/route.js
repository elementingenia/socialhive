import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import { requireSwapMember, membersById, withPhotos, LISTING_COLS } from "@/lib/swapServer"
import {
  canReadConversation, isParty, isConversationClosed, validateMessage, needsPrivacyAck,
  swapName, messageNotification, otherPartyId,
} from "@/lib/swap"

export const dynamic = "force-dynamic"

const CONVO_COLS = "id, listing_id, buyer_id, seller_id, last_message_at, buyer_last_read_at, seller_last_read_at, reported_at, created_at"

async function load(id) {
  const { data: convo } = await supa.from("swap_conversations").select(CONVO_COLS).eq("id", id).maybeSingle()
  if (!convo) return {}
  const { data: listing } = await supa.from("swap_listings").select(LISTING_COLS).eq("id", convo.listing_id).maybeSingle()
  return { convo, listing }
}

// GET -- the thread. Buyer and seller only; an admin only once the
// conversation has been reported (decision 5). Opening it marks it read
// for the caller.
export async function GET(req, { params }) {
  const ctx = await requireSwapMember(req)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { member } = ctx
  const { convo, listing } = await load(params.id)
  if (!convo || !canReadConversation(convo, { memberId: member.id, isAdmin: member.is_admin })) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  const { data: messages } = await supa.from("swap_messages")
    .select("id, sender_id, body, created_at").eq("conversation_id", convo.id).order("created_at")
  const people = await membersById([convo.buyer_id, convo.seller_id])
  const [withPics] = listing ? await withPhotos([listing]) : [null]

  const party = isParty(convo, member.id)
  if (party) {
    const field = convo.buyer_id === member.id ? "buyer_last_read_at" : "seller_last_read_at"
    await supa.from("swap_conversations").update({ [field]: new Date().toISOString() }).eq("id", convo.id)
  }

  return NextResponse.json({
    conversation: {
      id: convo.id,
      role: convo.seller_id === member.id ? "seller" : convo.buyer_id === member.id ? "buyer" : "admin",
      buyer_name: swapName(people[convo.buyer_id]),
      seller_name: swapName(people[convo.seller_id]),
      other_name: party ? swapName(people[otherPartyId(convo, member.id)]) : null,
      reported: !!convo.reported_at,
      closed: isConversationClosed(listing),
      can_post: party && !isConversationClosed(listing),
    },
    listing: withPics ? {
      id: withPics.id, title: withPics.title, type: withPics.type, status: withPics.status,
      price_dollars: withPics.price_dollars, price_is_offers: withPics.price_is_offers,
      main_photo_url: withPics.main_photo_url, hidden: !!withPics.hidden_at,
      expires_at: withPics.expires_at,
    } : null,
    messages: (messages || []).map(m => ({
      id: m.id, body: m.body, created_at: m.created_at,
      mine: m.sender_id === member.id,
      sender_name: swapName(people[m.sender_id]),
    })),
  })
}

// POST { body } -- reply in the thread. Parties only, while it's open.
export async function POST(req, { params }) {
  const ctx = await requireSwapMember(req)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { member } = ctx
  if (needsPrivacyAck(member)) {
    return NextResponse.json({ error: "Please read the privacy note first.", needsPrivacyAck: true }, { status: 409 })
  }
  const { convo, listing } = await load(params.id)
  if (!convo || !isParty(convo, member.id)) return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  if (isConversationClosed(listing)) return NextResponse.json({ error: "This conversation has closed." }, { status: 400 })

  const { body } = await req.json().catch(() => ({}))
  const { error: mErr, value: text } = validateMessage(body)
  if (mErr) return NextResponse.json({ error: mErr }, { status: 400 })

  const nowIso = new Date().toISOString()
  const { data: msg, error } = await supa.from("swap_messages")
    .insert({ conversation_id: convo.id, sender_id: member.id, body: text })
    .select("id, body, created_at").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const readField = convo.buyer_id === member.id ? "buyer_last_read_at" : "seller_last_read_at"
  await supa.from("swap_conversations").update({ last_message_at: nowIso, [readField]: nowIso }).eq("id", convo.id)

  const to = otherPartyId(convo, member.id)
  await notify(to, null, "swap_message", messageNotification(listing, swapName(member)), `/swap/messages/${convo.id}`, member.id)

  return NextResponse.json({ ok: true, message: { ...msg, mine: true, sender_name: swapName(member) } })
}
