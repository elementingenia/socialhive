import { NextResponse } from "next/server"
import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { requireAdminOrAreaOwner, resolveMember } from "@/lib/areaAuth"
import { FAIR_PICK_SETTING_KEY, DEFAULT_FAIR_PICK_CONFIG, sortBuckets, validateFairPickConfig } from "@/lib/fairPick"
import { loadFairPickConfig } from "@/lib/fairPickData"

export const dynamic = "force-dynamic"

// Fair Pick settings, Admin > Hub Settings > Show Time (Iain, 2026-10-27).
//   GET -> { config, defaults, updatedAt, saved }   admins + Show Time Owners
//   PUT { config } -> saves                        admins only
// Stored as JSON in settings[fair_pick_config]. Takes effect on the next
// load of Pick a Film / Suggestions; nothing is cached.
export async function GET(req) {
  const auth = await requireAdminOrAreaOwner(req, "hub", "movie")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { config, updatedAt, saved } = await loadFairPickConfig()
  return NextResponse.json({ config, defaults: DEFAULT_FAIR_PICK_CONFIG, updatedAt, saved })
}

const NUMBER_KEYS = Object.keys(DEFAULT_FAIR_PICK_CONFIG).filter(k => k !== "attendanceBuckets")

export async function PUT(req) {
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })
  if (!member.is_admin) return NextResponse.json({ error: "Admins only" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const raw = body?.config || {}
  // Keep only known fields, as numbers.
  const config = {
    attendanceBuckets: sortBuckets((Array.isArray(raw.attendanceBuckets) ? raw.attendanceBuckets : [])
      .map(b => ({ from: Number(b?.from), weight: Number(b?.weight) }))),
  }
  for (const k of NUMBER_KEYS) config[k] = Number(raw[k])

  const invalid = validateFairPickConfig(config)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  const { error: e } = await supa.from("settings")
    .upsert({ key: FAIR_PICK_SETTING_KEY, value: JSON.stringify(config), updated_at: new Date().toISOString() }, { onConflict: "key" })
  if (e) return NextResponse.json({ error: "Could not save the settings." }, { status: 500 })
  return NextResponse.json({ ok: true, config })
}
