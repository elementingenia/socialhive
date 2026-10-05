import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { requireSwapMember, membersById, notifySwapFollowers, withPhotos, LISTING_COLS } from "@/lib/swapServer"
import {
  validateListing, isListingActive, countActive, capReached, needsPrivacyAck, swapName,
  expiryFrom, newListingMessage,
} from "@/lib/swap"

export const dynamic = "force-dynamic"

// GET /api/swap          -- Browse: every active listing (newest first)
// GET /api/swap?mine=1   -- My Listings: all of the caller's own listings
// Both return `me` (cap, blocked, privacy-ack state) for the page to use.
export async function GET(req) {
  const ctx = await requireSwapMember(req)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { member, settings, blocked } = ctx
  const now = new Date()
  const mine = new URL(req.url).searchParams.get("mine") === "1"

  let query = supa.from("swap_listings").select(LISTING_COLS).order("created_at", { ascending: false })
  if (mine) {
    query = query.eq("member_id", member.id)
  } else {
    query = query.neq("status", "gone").is("hidden_at", null).gt("expires_at", now.toISOString())
  }
  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const sellers = await membersById((rows || []).map(r => r.member_id))
  let listings = (rows || []).filter(r => mine || member.is_admin || !sellers[r.member_id]?.is_test)
  if (!mine) listings = listings.filter(r => isListingActive(r, now))
  listings = await withPhotos(listings)

  // Conversation info: for my own listings, how many people have asked;
  // for other people's, the id of my conversation about it (if any).
  const ids = listings.map(l => l.id)
  const convos = ids.length
    ? (await supa.from("swap_conversations").select("id, listing_id, buyer_id").in("listing_id", ids)).data || []
    : []

  const out = listings.map(l => ({
    ...l,
    seller_name: swapName(sellers[l.member_id]),
    is_mine: l.member_id === member.id,
    enquiry_count: l.member_id === member.id ? convos.filter(c => c.listing_id === l.id).length : undefined,
    my_conversation_id: convos.find(c => c.listing_id === l.id && c.buyer_id === member.id)?.id || null,
  }))

  let activeCount
  if (mine) {
    activeCount = countActive(rows, now)
  } else {
    const { data: own } = await supa.from("swap_listings").select("status, hidden_at, expires_at").eq("member_id", member.id)
    activeCount = countActive(own, now)
  }

  return NextResponse.json({
    listings: out,
    me: {
      id: member.id,
      isAdmin: !!member.is_admin,
      live: settings.live,
      blocked,
      cap: settings.cap,
      activeCount,
      needsPrivacyAck: needsPrivacyAck(member),
    },
  })
}

// POST /api/swap -- create a listing. Photos are added afterwards via
// /api/swap/photos (same two-step shape as Happenings News).
export async function POST(req) {
  const ctx = await requireSwapMember(req)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { member, settings, blocked } = ctx
  if (blocked) return NextResponse.json({ error: "An admin has paused your listings in Swap & Sell." }, { status: 403 })
  if (needsPrivacyAck(member)) {
    return NextResponse.json({ error: "Please read the privacy note first.", needsPrivacyAck: true }, { status: 409 })
  }

  const body = await req.json().catch(() => ({}))
  if (body.allowed !== true) {
    return NextResponse.json({ error: "Please confirm the item is allowed." }, { status: 400 })
  }
  const { error: vErr, value } = validateListing(body)
  if (vErr) return NextResponse.json({ error: vErr }, { status: 400 })

  const now = new Date()
  const { data: own } = await supa.from("swap_listings").select("status, hidden_at, expires_at").eq("member_id", member.id)
  if (capReached(countActive(own, now), settings.cap)) {
    return NextResponse.json({
      error: `You can have ${settings.cap} active listing${settings.cap === 1 ? "" : "s"} at a time. Mark one as Gone first.`,
    }, { status: 409 })
  }

  const { data: listing, error } = await supa.from("swap_listings")
    .insert({ ...value, member_id: member.id, status: "available", expires_at: expiryFrom(now).toISOString() })
    .select(LISTING_COLS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Opt-in alert to residents who Joined Swap & Sell (decision 10). Not
  // awaited past the insert -- the poster shouldn't wait on the fan-out.
  // Test accounts never trigger it.
  // Only while the hub is live -- an admin trialling it while hidden must
  // not ping residents about a page they can't open.
  if (!member.is_test && settings.live) {
    notifySwapFollowers("swap_new_listing", newListingMessage(listing, swapName(member)), "/swap", member.id).catch(() => {})
  }

  return NextResponse.json({ ok: true, listing })
}
