import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import { requireSwapMember, membersById, withPhotos, LISTING_COLS } from "@/lib/swapServer"
import {
  canStartConversation, validateMessage, needsPrivacyAck, swapName, isUnreadFor,
  isConversationClosed, messageNotification, otherPartyId,
} from "@/lib/swap"

export const dynamic = "force-dynamic"

// GET -- the caller's conversations (as buyer or seller), newest activity first.
export async function GET(req) {
  const ctx = await requireSwapMember(req)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { member } = ctx

  const { data: convos, error } = await supa.from("swap_conversations")
    .select("id, listing_id, buyer_id, seller_id, last_message_at, buyer_last_read_at, seller_last_read_at, reported_at, created_at")
    .or(`buyer_id.eq.${member.id},seller_id.eq.${member.id}`)
    .order("last_message_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!convos?.length) return NextResponse.json({ conversations: [] })

  const { data: listingRows } = await supa.from("swap_listings").select(LISTING_COLS).in("id", [...new Set(convos.map(c => c.listing_id))])
  const listings = Object.fromEntries((await withPhotos(listingRows || [])).map(l => [l.id, l]))
  const people = await membersById(convos.flatMap(c => [c.buyer_id, c.seller_id]))

  // Latest message per conversation (preview + who sent it).
  const { data: msgs } = await supa.from("swap_messages")
    .select("conversation_id, sender_id, body, created_at")
    .in("conversation_id", convos.map(c => c.id))
    .order("created_at", { ascending: false })
  const latest = {}
  for (const m of msgs || []) if (!latest[m.conversation_id]) latest[m.conversation_id] = m

  const now = new Date()
  const conversations = convos.map(c => {
    const l = listings[c.listing_id]
    const last = latest[c.id]
    const withSender = { ...c, last_sender_id: last?.sender_id || null }
    return {
      id: c.id,
      role: c.seller_id === member.id ? "seller" : "buyer",
      other_name: swapName(people[otherPartyId(c, member.id)]),
      listing: l ? {
        id: l.id, title: l.title, type: l.type, status: l.status, price_dollars: l.price_dollars,
        price_is_offers: l.price_is_offers, main_photo_url: l.main_photo_url,
      } : null,
      last_message: last ? { body: last.body, mine: last.sender_id === member.id, created_at: last.created_at } : null,
      last_message_at: c.last_message_at,
      unread: isUnreadFor(withSender, member.id),
      closed: isConversationClosed(l, now),
    }
  })
  return NextResponse.json({ conversations })
}

// POST { listing_id, body } -- message the seller (or, on a Wanted post,
// say "I have one"). Reuses the caller's existing conversation about this
// listing if there is one -- one conversation per buyer per listing.
export async function POST(req) {
  const ctx = await requireSwapMember(req)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { member } = ctx
  if (needsPrivacyAck(member)) {
    return NextResponse.json({ error: "Please read the privacy note first.", needsPrivacyAck: true }, { status: 409 })
  }
  const { listing_id, body } = await req.json().catch(() => ({}))
  const { error: mErr, value: text } = validateMessage(body)
  if (mErr) return NextResponse.json({ error: mErr }, { status: 400 })

  const { data: listing } = await supa.from("swap_listings").select(LISTING_COLS).eq("id", listing_id).maybeSingle()
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 })

  let { data: convo } = await supa.from("swap_conversations")
    .select("id, buyer_id, seller_id").eq("listing_id", listing.id).eq("buyer_id", member.id).maybeSingle()

  if (!convo) {
    if (!canStartConversation(listing, member.id)) {
      const why = listing.member_id === member.id ? "This is your own listing." : "This listing is no longer available."
      return NextResponse.json({ error: why }, { status: 400 })
    }
    const ins = await supa.from("swap_conversations")
      .insert({ listing_id: listing.id, buyer_id: member.id, seller_id: listing.member_id })
      .select("id, buyer_id, seller_id").single()
    if (ins.error) {
      // Two taps at once: the unique (listing_id, buyer_id) caught the race.
      const again = await supa.from("swap_conversations").select("id, buyer_id, seller_id").eq("listing_id", listing.id).eq("buyer_id", member.id).maybeSingle()
      if (!again.data) return NextResponse.json({ error: ins.error.message }, { status: 500 })
      convo = again.data
    } else {
      convo = ins.data
    }
  } else if (isConversationClosed(listing)) {
    return NextResponse.json({ error: "This conversation has closed." }, { status: 400 })
  }

  const nowIso = new Date().toISOString()
  const { error: msgErr } = await supa.from("swap_messages").insert({ conversation_id: convo.id, sender_id: member.id, body: text })
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 })
  await supa.from("swap_conversations").update({ last_message_at: nowIso, buyer_last_read_at: nowIso }).eq("id", convo.id)

  await notify(convo.seller_id, null, "swap_message", messageNotification(listing, swapName(member)), `/swap/messages/${convo.id}`, member.id)
  return NextResponse.json({ ok: true, conversation_id: convo.id })
}
