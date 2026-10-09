import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { randomInt } from "crypto"
import QRCode from "qrcode"
import { newPinColumns } from "@/lib/pinAuth"
import {
  HELP_SETTING_KEY, generateStartingPin, sortForWalking, filterForScope, cardLoginUrl, siteLabel,
} from "@/lib/welcomeCards"

// Admin › Sign-in Help (Iain, 2026-10-09). Lists residents who have never
// signed in (or everyone, for reprints) and prints welcome cards. Printing a
// card issues a fresh one-time password -- PINs are hashed (migration 132),
// so the old one can't be shown -- with must_change_pin set, exactly like
// Admin's Reset PIN. Admin only (decision 3): printing resets a credential.

export const dynamic = "force-dynamic"

const toAuthPassword = (pin) => pin + "_hive"
const MAX_PER_PRINT = 60

async function requireAdmin(req) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!token) return null
  const { data: { user } } = await supa.auth.getUser(token)
  if (!user) return null
  const { data: member } = await supa.from("members").select("id, is_admin").eq("auth_id", user.id).single()
  return member?.is_admin ? member : null
}

async function readHelpLine() {
  const { data } = await supa.from("settings").select("value").eq("key", HELP_SETTING_KEY).maybeSingle()
  return data?.value || ""
}

export async function GET(req) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 })
  const scope = new URL(req.url).searchParams.get("scope") === "all" ? "all" : "never"

  const { data, error } = await supa.from("members")
    .select("id, name, username, house_number, status, is_test, auth_id, welcome_card_printed_at, welcome_card_printed_by")
    .eq("status", "active").eq("is_test", false)
  if (error) return NextResponse.json({ error: "Could not load residents." }, { status: 500 })

  const all = data || []
  // Printer names via a plain lookup, not an embed: members -> members is a
  // self-reference and an embed hint there is easy to get wrong (Standard #9).
  const nameById = new Map(all.map(m => [m.id, m.name]))
  const residents = sortForWalking(filterForScope(all, scope)).map(m => ({
    id: m.id, name: m.name, username: m.username, house_number: m.house_number,
    signedIn: !!m.auth_id,
    printedAt: m.welcome_card_printed_at || null,
    printedBy: nameById.get(m.welcome_card_printed_by) || null,
  }))
  return NextResponse.json({
    residents,
    neverCount: all.filter(m => !m.auth_id).length,
    helpLine: await readHelpLine(),
  })
}

export async function POST(req) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 })
  const body = await req.json().catch(() => ({}))

  if (body.action === "set_help") {
    const text = String(body.text || "").trim().slice(0, 120)
    const { error } = await supa.from("settings")
      .upsert({ key: HELP_SETTING_KEY, value: text, updated_at: new Date().toISOString() }, { onConflict: "key" })
    if (error) return NextResponse.json({ error: "Could not save the help line." }, { status: 500 })
    return NextResponse.json({ ok: true, helpLine: text })
  }

  if (body.action !== "print") return NextResponse.json({ error: "Unknown action" }, { status: 400 })

  const ids = [...new Set((body.member_ids || []).filter(Boolean))]
  if (!ids.length) return NextResponse.json({ error: "Choose at least one resident." }, { status: 400 })
  if (ids.length > MAX_PER_PRINT) return NextResponse.json({ error: `Print at most ${MAX_PER_PRINT} cards at a time.` }, { status: 400 })

  const { data: rows, error } = await supa.from("members")
    .select("id, name, username, house_number, status, is_test, auth_id").in("id", ids)
  if (error) return NextResponse.json({ error: "Could not load residents." }, { status: 500 })
  const members = sortForWalking((rows || []).filter(m => m.status === "active" && !m.is_test && m.username))

  const origin = new URL(req.url).origin
  const now = new Date().toISOString()
  const cards = []
  const failed = []

  for (const m of members) {
    const pin = generateStartingPin(randomInt)
    if (m.auth_id) {
      const { error: authErr } = await supa.auth.admin.updateUserById(m.auth_id, { password: toAuthPassword(pin) })
      if (authErr) { failed.push(m.name); continue }
    }
    const { error: upErr } = await supa.from("members").update({
      ...newPinColumns(pin), must_change_pin: true,
      welcome_card_printed_at: now, welcome_card_printed_by: admin.id,
    }).eq("id", m.id)
    if (upErr) { failed.push(m.name); continue }

    const qrSvg = await QRCode.toString(cardLoginUrl(origin, m.username), { type: "svg", margin: 0, errorCorrectionLevel: "M" })
    cards.push({ name: m.name, house_number: m.house_number, username: m.username, pin, qrSvg })
  }

  return NextResponse.json({ cards, failed, site: siteLabel(origin), helpLine: await readHelpLine() })
}
