import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import { requireSwapMember, membersById, withPhotos, LISTING_COLS } from "@/lib/swapServer"
import {
  validateListing, isListingActive, countActive, capReached, swapName, expiryFrom,
  goneNotification, STATUSES,
} from "@/lib/swap"

export const dynamic = "force-dynamic"

async function loadListing(id) {
  const { data } = await supa.from("swap_listings").select(LISTING_COLS).eq("id", id).maybeSingle()
  return data
}

// GET /api/swap/[id] -- one listing. Anyone may see an active listing; the
// seller and admins may also see it when Gone / expired / hidden.
export async function GET(req, { params }) {
  const ctx = await requireSwapMember(req)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { member } = ctx
  const listing = await loadListing(params.id)
  const isMine = listing?.member_id === member.id
  if (!listing || (!isListingActive(listing) && !isMine && !member.is_admin)) {
    return NextResponse.json({ error: "This listing is no longer available" }, { status: 404 })
  }
  const [withPics] = await withPhotos([listing])
  const sellers = await membersById([listing.member_id])
  const { data: convos } = await supa.from("swap_conversations").select("id, buyer_id").eq("listing_id", listing.id)
  return NextResponse.json({
    listing: {
      ...withPics,
      seller_name: swapName(sellers[listing.member_id]),
      is_mine: isMine,
      enquiry_count: isMine ? (convos || []).length : undefined,
      my_conversation_id: (convos || []).find(c => c.buyer_id === member.id)?.id || null,
    },
  })
}

// PATCH /api/swap/[id]
//   Seller: edit fields, { status }, { keep_listed: true }, { main_photo_id }
//   Admin:  { hidden: true|false }
export async function PATCH(req, { params }) {
  const ctx = await requireSwapMember(req)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { member, settings } = ctx
  const listing = await loadListing(params.id)
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  const now = new Date()
  const nowIso = now.toISOString()

  // ── Admin hide / unhide ───────────────────────────────────────────────────
  if (body.hidden !== undefined) {
    if (!member.is_admin) return NextResponse.json({ error: "Admins only" }, { status: 403 })
    const update = body.hidden
      ? { hidden_at: nowIso, hidden_by: member.id, updated_at: nowIso }
      : { hidden_at: null, hidden_by: null, updated_at: nowIso }
    const { error } = await supa.from("swap_listings").update(update).eq("id", listing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (listing.member_id !== member.id) return NextResponse.json({ error: "Only the person who listed this can change it" }, { status: 403 })
  if (listing.hidden_at) return NextResponse.json({ error: "An admin has taken this listing down." }, { status: 403 })

  // Would this change bring an inactive listing back onto Browse? Then the
  // cap applies, same as creating a new one.
  async function checkCapForReactivation() {
    const { data: own } = await supa.from("swap_listings").select("id, status, hidden_at, expires_at").eq("member_id", member.id)
    const others = (own || []).filter(l => l.id !== listing.id)
    if (capReached(countActive(others, now), settings.cap)) {
      return `You can have ${settings.cap} active listing${settings.cap === 1 ? "" : "s"} at a time. Mark another as Gone first.`
    }
    return null
  }

  const update = { updated_at: nowIso }

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: "Unknown status" }, { status: 400 })
    if (body.status !== "gone" && !isListingActive(listing, now)) {
      const capErr = await checkCapForReactivation()
      if (capErr) return NextResponse.json({ error: capErr }, { status: 409 })
      // Bringing a Gone/expired listing back starts a fresh 30 days.
      update.expires_at = expiryFrom(now).toISOString()
      update.expiry_reminded_at = null
    }
    update.status = body.status
    update.gone_at = body.status === "gone" ? (listing.status === "gone" ? listing.gone_at : nowIso) : null
  }

  if (body.keep_listed === true) {
    if (listing.status === "gone") return NextResponse.json({ error: "Mark it Available first." }, { status: 400 })
    if (!isListingActive(listing, now)) {
      const capErr = await checkCapForReactivation()
      if (capErr) return NextResponse.json({ error: capErr }, { status: 409 })
    }
    update.expires_at = expiryFrom(now).toISOString()
    update.expiry_reminded_at = null
  }

  if (body.main_photo_id !== undefined) {
    const { data: photo } = await supa.from("swap_listing_photos").select("id").eq("id", body.main_photo_id).eq("listing_id", listing.id).maybeSingle()
    if (!photo) return NextResponse.json({ error: "That photo isn't on this listing" }, { status: 400 })
    update.main_photo_id = photo.id
  }

  const editFields = ["type", "title", "description", "category", "condition", "price_dollars", "price_is_offers"]
  if (editFields.some(k => Object.prototype.hasOwnProperty.call(body, k))) {
    const picked = Object.fromEntries(editFields.filter(k => Object.prototype.hasOwnProperty.call(body, k)).map(k => [k, body[k]]))
    const { error: vErr, value } = validateListing(picked, { partial: true, existing: listing })
    if (vErr) return NextResponse.json({ error: vErr }, { status: 400 })
    Object.assign(update, value)
  }

  const { data: updated, error } = await supa.from("swap_listings").update(update).eq("id", listing.id).select(LISTING_COLS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Gone: one "no longer available" note to everyone who messaged about it
  // (decision: no conversation means nobody is told). Reserved sends nothing.
  if (body.status === "gone" && listing.status !== "gone") {
    const { data: convos } = await supa.from("swap_conversations").select("buyer_id").eq("listing_id", listing.id)
    const msg = goneNotification(updated)
    await Promise.all((convos || []).map(c => notify(c.buyer_id, null, "swap_item_gone", msg, "/swap/messages", member.id)))
  }

  return NextResponse.json({ ok: true, listing: updated })
}
