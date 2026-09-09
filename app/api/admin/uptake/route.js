import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"

// Admin-only resident uptake statistic (2026-09-09, Iain: "let's do the
// build so we can have an easy statistic to call on"). Everything here reads
// data that already exists -- members.last_active_at has been live since
// migration 009 (kept current on login + a 5-minute app heartbeat) -- this
// route just aggregates it into one number set instead of Iain running SQL
// by hand in the Supabase editor each time. See migration 102 for the one
// piece that genuinely didn't exist: a place to store the total-occupied-
// households denominator, which this app has no live source of truth for.

async function requireAdmin(req) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return null
  const { data: member } = await supabaseAdmin
    .from("members").select("id, is_admin").eq("auth_id", user.id).single()
  return member?.is_admin ? member : null
}

const DAY_MS = 24 * 60 * 60 * 1000

export async function GET(req) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 })

  // Real accounts only -- excludes is_test (migration 087, e.g. testbot),
  // same exclusion the resident-facing Contacts directory already uses.
  const { data: members, error } = await supabaseAdmin
    .from("members")
    .select("house_number, last_active_at, joined_date")
    .eq("status", "active")
    .eq("is_test", false)

  if (error) return NextResponse.json({ error: "Could not load member data." }, { status: 500 })

  const now = Date.now()
  const cutoff = (days) => now - days * DAY_MS

  const registeredMembers = members.length
  const households = new Set(members.filter(m => m.house_number).map(m => m.house_number)).size

  const activeSince = (days) =>
    members.filter(m => m.last_active_at && new Date(m.last_active_at).getTime() >= cutoff(days)).length

  const { data: setting } = await supabaseAdmin
    .from("settings").select("value").eq("key", "total_occupied_households").maybeSingle()
  const totalOccupiedHouseholds = setting?.value ? Number(setting.value) : null

  return NextResponse.json({
    registeredMembers,
    households,
    totalOccupiedHouseholds,
    active7d: activeSince(7),
    active30d: activeSince(30),
    active90d: activeSince(90),
    // How many registered members even have an activity timestamp yet --
    // caveat surfaced in the UI, not hidden: migration 009 backfilled
    // last_active_at = NOW() for pre-existing rows on the day it ran, so a
    // member who registered before then and genuinely never logged back in
    // still reads as "active" on that one backfill date, not "never".
    generatedAt: new Date(now).toISOString(),
  })
}
