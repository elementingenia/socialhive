import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { resolveMember, isAreaOwner } from "@/lib/areaAuth"
import { hubLocation } from "@/lib/eventClash"
import { findAnyRoomConflict } from "@/lib/spaceBookings"
import { titleFor } from "@/lib/showing"
import { notify } from "@/lib/notify"
import { notifyHubFollowers } from "@/lib/notifyAudience"
import {
  WIZARD_HUB_TYPE, DEFAULT_MAX_PER_BOOKING, cinemaCapacity, canUseWizard,
  validateResidentShowing, allResidentsAudience, shortDate,
} from "@/lib/residentShowing"

// Show Time: any resident can add a showing through the wizard (Iain,
// 2026-10-07). Scope: claude/Element_Happenings_ShowTime_Resident_Events_Scope_Answered.md
//
// Everyone creates through this route -- residents, Owners and admins alike.
// Editing afterwards uses the normal PATCH /api/screenings (admin, Show Time
// Owner, or one of the showing's coordinators).

export const dynamic = "force-dynamic"

const MOVIES_HUB = "movies"   // hub_settings spelling -- events use "movie"
const CINEMA_NAME = "Cinema"

async function loadContext(req) {
  const { error, status, member } = await resolveMember(req)
  if (error) return { error, status }
  const [{ data: me }, { data: setting }, isOwner, cinema] = await Promise.all([
    supabaseAdmin.from("members").select("id, name, display_name, hide_name, is_admin").eq("id", member.id).maybeSingle(),
    supabaseAdmin.from("hub_settings").select("enabled").eq("hub_type", WIZARD_HUB_TYPE).maybeSingle(),
    isAreaOwner(member.id, "hub", "movie"),
    hubLocation(supabaseAdmin, MOVIES_HUB, CINEMA_NAME),
  ])
  const isManager = !!member.is_admin || isOwner
  return {
    member: { ...member, ...(me || {}) },
    isManager,
    // No row (migration 131 not run) reads as Off.
    enabled: setting?.enabled === true,
    cinema,
  }
}

// What the wizard needs before it starts.
export async function GET(req) {
  const ctx = await loadContext(req)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  return NextResponse.json({
    canUse: canUseWizard(ctx),
    enabled: ctx.enabled,
    isManager: ctx.isManager,
    isPrivate: !!ctx.member.hide_name,
    capacity: cinemaCapacity(ctx.cinema),
    venueName: ctx.cinema?.name || CINEMA_NAME,
  })
}

export async function POST(req) {
  const ctx = await loadContext(req)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { member, isManager, cinema } = ctx
  if (!canUseWizard(ctx)) {
    return NextResponse.json({ error: "Adding a showing isn't open yet" }, { status: 403 })
  }
  if (!cinema) {
    return NextResponse.json({ error: "The Show Time venue isn't set up. Ask an admin to check Admin > Show Time." }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const capacity = cinemaCapacity(cinema)
  const invalid = validateResidentShowing(body, { capacity, isPrivate: !!member.hide_name })
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  const { movie_id, showing_title, event_date, event_time, event_end_time, notify: notifyChoice } = body
  const seatsKept = Number(body.seats_kept)

  // Title and poster snapshot, same as the screening form.
  let title = titleFor({ freeText: showing_title })
  let movieSnapshot = null
  let movieId = null
  if (movie_id) {
    const { data: movie } = await supabaseAdmin
      .from("movies").select("id, title, director, poster_url, year").eq("id", movie_id).maybeSingle()
    if (!movie) return NextResponse.json({ error: "That movie couldn't be found. Search for it again." }, { status: 400 })
    movieId = movie.id
    title = titleFor({ movieTitle: movie.title })
    movieSnapshot = { title: movie.title, director: movie.director, poster_url: movie.poster_url, year: movie.year }
  }

  // Clash: another event or space booking already holds the Cinema then.
  const conflict = await findAnyRoomConflict(supabaseAdmin, {
    location_id: cinema.id, event_date, event_time, event_end_time,
    locationName: cinema.name, viewerId: member.id, canManage: !!member.is_admin,
  })
  if (conflict) return NextResponse.json({ error: conflict.message }, { status: 409 })

  const { data: event, error } = await supabaseAdmin
    .from("events")
    .insert({
      hub_type: "movie", title, movie_id: movieId,
      event_date, event_time, event_end_time,
      max_seats: capacity,
      max_seats_per_booking: DEFAULT_MAX_PER_BOOKING,
      reservation_cutoff: null,
      allow_nonresident_guests: true,       // "Anyone"
      require_attendee_names: false,
      notes: null,
      created_by: member.id,
      movie_snapshot: movieSnapshot,
      location_type: "onsite", location: cinema.name, location_id: cinema.id,
      is_public: false,                     // inside the app only
      ingenia_confirmed: true,
    })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Coordinator = the creator. Their seats are a real confirmed booking, not
  // a reduction in capacity, so they show in the attendee list and can be
  // changed or cancelled like anyone else's. Not capped by Max per booking.
  const undo = async (msg) => {
    await supabaseAdmin.from("event_coordinators").delete().eq("event_id", event.id)
    await supabaseAdmin.from("bookings").delete().eq("event_id", event.id)
    await supabaseAdmin.from("events").delete().eq("id", event.id)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  const { error: ecErr } = await supabaseAdmin.from("event_coordinators")
    .insert({ event_id: event.id, member_id: member.id, assigned_by: member.id })
  if (ecErr) return undo(ecErr.message)
  if (seatsKept > 0) {
    const { error: bkErr } = await supabaseAdmin.from("bookings").insert({
      event_id: event.id, member_id: member.id, seats: seatsKept, status: "confirmed",
      booked_at: new Date().toISOString(), payment_status: "not_required",
    })
    if (bkErr) return undo(bkErr.message)
  }

  // Notifications. Owners always hear about it (even with "Nobody"), with
  // their own message, and are left out of the general fan-out so they don't
  // get two.
  const when = shortDate(event_date)
  const { data: ownerRows } = await supabaseAdmin.from("space_owners")
    .select("member_id").eq("context_type", "hub").eq("context_key", "movie")
  const ownerIds = [...new Set((ownerRows || []).map(o => o.member_id).filter(id => id && id !== member.id))]
  const creatorName = member.display_name || member.name || "A resident"
  await Promise.all(ownerIds.map(id => notify(id, event.id, "showtime_resident_event",
    `${creatorName} added a Show Time showing: ${title} — ${when}. Ingenia Cinema booking confirmed.`)))

  const message = `New showing: ${title} — ${when}`
  let notified = 0
  if (notifyChoice === "all") {
    const { data: everyone } = await supabaseAdmin.from("members").select("id, status, auth_id, is_test")
    const ids = allResidentsAudience(everyone, [member.id, ...ownerIds])
    await Promise.all(ids.map(id => notify(id, event.id, "event_added", message)))
    notified = ids.length
  } else if (notifyChoice === "members") {
    notified = await notifyHubFollowers(supabaseAdmin, "movie", event.id, "event_added", message,
      { excludeMemberId: [member.id, ...ownerIds] })
  }

  return NextResponse.json({ ...event, notified, isManager })
}
