import { NextResponse } from "next/server"
import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { requireAdminOrAreaOwner } from "@/lib/areaAuth"

export const dynamic = "force-dynamic"

// Show Time > Suggestions list management (2026-10-25, lib/suggestionList.js).
// Admins and Show Time Owners only.
//   { action: "set_night", night: "action" | "sunday" }  -- move to the other tab
//   { action: "retire" }                                -- hide from residents
//   { action: "restore" }                               -- bring back; restarts the 60-day clock
export async function PATCH(req, { params }) {
  const auth = await requireAdminOrAreaOwner(req, "hub", "movie")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const id = params?.id
  if (!id) return NextResponse.json({ error: "Missing movie" }, { status: 400 })
  const body = await req.json().catch(() => ({}))

  let patch
  if (body.action === "set_night") {
    if (body.night !== "action" && body.night !== "sunday") return NextResponse.json({ error: "Choose Action Night or Sunday Night" }, { status: 400 })
    patch = { showtime_night: body.night }
  } else if (body.action === "retire") {
    patch = { suggestion_retired_at: new Date().toISOString() }
  } else if (body.action === "restore") {
    patch = { suggestion_retired_at: null, suggestion_clock_from: new Date().toISOString() }
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  }

  const { data, error } = await supa.from("movies").update(patch).eq("id", id)
    .select("id, showtime_night, suggestion_retired_at, suggestion_clock_from").maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Movie not found" }, { status: 404 })
  return NextResponse.json({ movie: data })
}
