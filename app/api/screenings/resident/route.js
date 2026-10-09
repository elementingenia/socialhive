import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { resolveMember, isAreaOwner } from "@/lib/areaAuth"
import { hubLocation } from "@/lib/eventClash"
import { findAnyRoomConflict } from "@/lib/spaceBookings"
import { titleFor } from "@/lib/showing"
import { notify } from "@/lib/notify"
import { notifyHubFollowers } from "@/lib/notifyAudience"
import { generateSeriesEvents } from "@/lib/generateSeriesEvents"
import {
  validateRepeat, ruleFor, planDates, describeRepeat, TBA_TITLE, SHOWING_NAME_MAX,
} from "@/lib/showtimeSeries"
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
    || validateRepeat(body.repeat)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
  if (body.repeat) return createRepeating({ body, member, isManager, cinema, capacity })

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


// ── Repeating showing (Iain, 2026-10-10) ────────────────────────────────────
// Scope: "Element Happenings – Show Time Repeating Showings – Scope Answered".
// Every date is created now as "To be announced". If the wizard already said
// what's on the first date, that date gets it straight away. Alerts go out
// only for a date whose content is set -- never for the run itself (agreed);
// Owners still hear that a run was added, as for any resident showing.
async function createRepeating({ body, member, isManager, cinema, capacity }) {
  const { movie_id, showing_title, event_date, event_time, event_end_time, notify: notifyChoice, repeat } = body
  const seatsKept = Number(body.seats_kept)
  const showingName = (repeat.showing_name || "").trim().slice(0, SHOWING_NAME_MAX) || null
  const dates = planDates({ kind: repeat.kind, firstDate: event_date, count: repeat.dates_ahead })
  if (!dates.length || dates[0] !== event_date) {
    return NextResponse.json({ error: "Those dates don't work out. Choose the first date again." }, { status: 400 })
  }

  // Every date must have the Cinema free. Say which ones don't.
  const clashes = []
  for (const d of dates) {
    const c = await findAnyRoomConflict(supabaseAdmin, {
      location_id: cinema.id, event_date: d, event_time, event_end_time,
      locationName: cinema.name, viewerId: member.id, canManage: !!member.is_admin,
    })
    if (c) clashes.push(shortDate(d))
  }
  if (clashes.length) {
    return NextResponse.json({ error: `The ${cinema.name} is already booked on ${clashes.join(", ")}. Choose a different time or first date.` }, { status: 409 })
  }

  // What's on the first date, if already chosen.
  let firstContent = null
  if (body.content_later !== true) {
    if (movie_id) {
      const { data: movie } = await supabaseAdmin
        .from("movies").select("id, title, director, poster_url, year").eq("id", movie_id).maybeSingle()
      if (!movie) return NextResponse.json({ error: "That movie couldn't be found. Search for it again." }, { status: 400 })
      firstContent = { movie_id: movie.id, title: titleFor({ movieTitle: movie.title }),
        movie_snapshot: { title: movie.title, director: movie.director, poster_url: movie.poster_url, year: movie.year } }
    } else {
      firstContent = { movie_id: null, title: titleFor({ freeText: showing_title }), movie_snapshot: null }
    }
  }

  const rule = ruleFor(repeat.kind, event_date)
  const { data: series, error: se } = await supabaseAdmin.from("event_series").insert({
    hub_type: "movie", club_id: null, created_by: member.id, mode: "series",
    rule_type: rule.rule_type, rule_config: rule.rule_config, month_end_policy: "clamp",
    horizon_months: 12, start_date: event_date, event_time, event_end_time,
    title: null, showing_name: showingName,
    location_type: "onsite", location: cinema.name, location_id: cinema.id,
    max_seats: capacity, max_seats_per_booking: DEFAULT_MAX_PER_BOOKING,
    allow_nonresident_guests: true, require_attendee_names: false, booking_required: true,
    is_public: false, coordinator_ids: [member.id],
    dates_ahead: dates.length, keep_rolling: repeat.keep_rolling === true,
    coordinator_seats: seatsKept > 0 ? seatsKept : 0, ingenia_confirmed: true,
  }).select("*").single()
  if (se) return NextResponse.json({ error: se.message }, { status: 500 })

  let gen
  try {
    gen = await generateSeriesEvents(series, { initial: true })
  } catch (e) {
    await supabaseAdmin.from("event_series").delete().eq("id", series.id)
    return NextResponse.json({ error: "Couldn't create the dates. Please try again." }, { status: 500 })
  }
  const first = (gen.events || []).find(e => e.event_date === event_date)
  if (!first) {
    return NextResponse.json({ error: "The first date couldn't be created. Please try again." }, { status: 500 })
  }
  if (firstContent) {
    await supabaseAdmin.from("events").update({ ...firstContent, content_tba: false }).eq("id", first.id)
  }

  // Owners always hear about a new run, with their own message.
  const howOften = describeRepeat(repeat.kind, event_date)
  const label = showingName || firstContent?.title || "A repeating showing"
  const { data: ownerRows } = await supabaseAdmin.from("space_owners")
    .select("member_id").eq("context_type", "hub").eq("context_key", "movie")
  const ownerIds = [...new Set((ownerRows || []).map(o => o.member_id).filter(id => id && id !== member.id))]
  const creatorName = member.display_name || member.name || "A resident"
  await Promise.all(ownerIds.map(id => notify(id, first.id, "showtime_resident_event",
    `${creatorName} added a repeating Show Time showing: ${label} — ${howOften.toLowerCase()}, ${gen.created} dates from ${shortDate(event_date)}${series.keep_rolling ? ", rolling" : ""}. Ingenia Cinema booking confirmed for the run.`)))

  // Residents only hear about the first date, and only if it has content.
  let notified = 0
  if (firstContent) {
    const message = `New showing: ${showingName ? `${showingName} — ` : ""}${firstContent.title} — ${shortDate(event_date)}`
    if (notifyChoice === "all") {
      const { data: everyone } = await supabaseAdmin.from("members").select("id, status, auth_id, is_test")
      const ids = allResidentsAudience(everyone, [member.id, ...ownerIds])
      await Promise.all(ids.map(id => notify(id, first.id, "event_added", message)))
      notified = ids.length
    } else if (notifyChoice === "members") {
      notified = await notifyHubFollowers(supabaseAdmin, "movie", first.id, "event_added", message,
        { excludeMemberId: [member.id, ...ownerIds] })
    }
  }

  return NextResponse.json({
    id: first.id, title: firstContent?.title || TBA_TITLE, showing_name: showingName,
    series_id: series.id, dates_created: gen.created, notified, isManager,
  })
}
