import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { randomInt } from "crypto"
import { newPinColumns } from "@/lib/pinAuth"
import {
  HELP_SETTING_KEY, generateStartingPin, sortForWalking, filterForScope, houseStats, housesNotSignedIn, houseKey,
  noLoginResidents, asHouseOccupant, cardLoginUrl, siteLabel,
} from "@/lib/welcomeCards"
import { buildWelcomeCardsPdf } from "@/lib/welcomeCardsPdf"
import { buildWelcomePackPdf } from "@/lib/welcomePackPdf"
import {
  PACK_INTRO_KEY, MAX_PER_PACK_RUN, cleanPackIntro, groupByHouse, packTitle, packFileName,
  homeScreenGuideUrl, committeeMayPack, cleanPackContact,
} from "@/lib/welcomePack"
import { isAreaOwner } from "@/lib/areaAuth"
import sharp from "sharp"
import { fetchSignedInAuthIds, hasSignedIn } from "@/lib/signedIn"
import { isBuiltInCategory } from "@/lib/contactCategories"

// Admin › Sign-in Help (Iain, 2026-10-09). Lists residents who have never
// signed in (or everyone, for reprints) and prints welcome cards. Printing a
// card issues a fresh one-time password -- PINs are hashed (migration 132),
// so the old one can't be shown -- with must_change_pin set, exactly like
// Admin's Reset PIN. Admin only (decision 3): printing resets a credential.
//
// Welcome pack (Iain, 2026-11-16): the card set inside a letter with the
// Home Screen steps, one letter per house, to share, text, email or download.
// Admins AND committee (Committee hub Owners) can make packs. A committee
// member who is not an admin is held to onboarding only -- residents who have
// never signed in, never an admin or a Private resident -- because a pack
// resets the password and shows the new one (lib/welcomePack.js
// committeeMayPack). Cards, the help line, the opening paragraph and Create
// login stay admin only.

export const dynamic = "force-dynamic"

const toAuthPassword = (pin) => pin + "_hive"
const MAX_PER_PRINT = 60

// Admin, or a Committee hub Owner. Returns { member, isAdmin } or null.
async function requireAccess(req) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!token) return null
  const { data: { user } } = await supa.auth.getUser(token)
  if (!user) return null
  const { data: member } = await supa.from("members").select("id, is_admin").eq("auth_id", user.id).single()
  if (!member) return null
  if (member.is_admin) return { member, isAdmin: true }
  return (await isAreaOwner(member.id, "hub", "committee")) ? { member, isAdmin: false } : null
}

async function requireAdmin(req) {
  const who = await requireAccess(req)
  return who?.isAdmin ? who.member : null
}

async function readSetting(key) {
  const { data } = await supa.from("settings").select("value").eq("key", key).maybeSingle()
  return data?.value || ""
}
const readHelpLine = () => readSetting(HELP_SETTING_KEY)

// The header logo for the pack, fetched from this site's own public folder
// (public files are not on the function's disk on Vercel) and shrunk once.
// The letter is drawn without it if anything goes wrong.
let logoCache = null
async function packLogo(origin) {
  if (logoCache) return logoCache
  try {
    const r = await fetch(`${origin}/logo_hex_bee.png`, { signal: AbortSignal.timeout(4000) })
    if (!r.ok) return null
    const raw = Buffer.from(await r.arrayBuffer())
    logoCache = await sharp(raw).resize({ height: 180 }).png().toBuffer()
    return logoCache
  } catch (e) {
    console.error("welcome-cards: pack logo unavailable", e.message)
    return null
  }
}

/**
 * Gives each resident a fresh one-time password (must change at first
 * sign-in) and records who issued it. Shared by cards and packs so the two
 * can never reset a password differently. Returns { cards, failed }.
 */
async function issueStartingPasswords(members, issuerId, origin) {
  const now = new Date().toISOString()
  const cards = [], failed = []
  for (const m of members) {
    const pin = generateStartingPin(randomInt)
    if (m.auth_id) {
      const { error: authErr } = await supa.auth.admin.updateUserById(m.auth_id, { password: toAuthPassword(pin) })
      if (authErr) { console.error("welcome-cards: auth update failed", m.id, authErr.message); failed.push(m.name); continue }
    }
    const { error: upErr } = await supa.from("members").update({
      ...newPinColumns(pin), must_change_pin: true,
      welcome_card_printed_at: now, welcome_card_printed_by: issuerId,
    }).eq("id", m.id)
    if (upErr) { console.error("welcome-cards: member update failed", m.id, upErr.message); failed.push(m.name); continue }
    cards.push({
      id: m.id, name: m.name, house_number: m.house_number, username: m.username, pin,
      loginUrl: cardLoginUrl(origin, m.username), phone: m.phone || null, email: m.email || null,
    })
  }
  return { cards, failed }
}

export async function GET(req) {
  const who = await requireAccess(req)
  if (!who) return NextResponse.json({ error: "Admins and committee only" }, { status: 403 })
  const { isAdmin } = who
  const asked = new URL(req.url).searchParams.get("scope")
  // Committee see only who they may make a pack for: never signed in.
  const scope = isAdmin
    ? (asked === "all" || asked === "houses" || asked === "nologin" ? asked : "never")
    : (asked === "houses" ? "houses" : "never")

  const { data, error } = await supa.from("members")
    .select("id, name, username, house_number, status, is_test, is_admin, hide_name, auth_id, welcome_card_printed_at, welcome_card_printed_by")
    .eq("status", "active").eq("is_test", false)
  if (error) return NextResponse.json({ error: "Could not load residents." }, { status: 500 })

  // "Signed in" comes from Supabase Auth's last_sign_in_at, not auth_id --
  // see lib/signedIn.js. If Auth can't be read, say so: a wrong count here
  // sends the committee to the wrong doors.
  const signedInIds = await fetchSignedInAuthIds(supa)
  if (!signedInIds) return NextResponse.json({ error: "Could not check who has signed in. Try again." }, { status: 500 })

  const all = data || []

  // Residents with no login yet (BUG-106): Residents-category contacts not
  // linked to a member. If they can't be read, say so rather than show 0.
  const [{ data: cats, error: catErr }, { data: contactRows, error: conErr }] = await Promise.all([
    supa.from("contact_categories").select("id, name"),
    supa.from("contacts").select("id, name, house_number, member_id, active, contact_category_members(category_id)").is("member_id", null),
  ])
  if (catErr || conErr) {
    console.error("welcome-cards: could not read contacts", (catErr || conErr).message)
    return NextResponse.json({ error: "Could not load residents without a login. Try again." }, { status: 500 })
  }
  const noLogin = noLoginResidents(contactRows, (cats || []).find(c => isBuiltInCategory(c.name))?.id || null)
  // Everyone who lives here, for the house numbers: logins + no-login residents.
  const occupants = [...all, ...noLogin.map(asHouseOccupant)]

  // Printer names via a plain lookup, not an embed: members -> members is a
  // self-reference and an embed hint there is easy to get wrong (Standard #9).
  const nameById = new Map(all.map(m => [m.id, m.name]))
  const row = m => ({
    id: m.id, name: m.name, username: m.username, house_number: m.house_number,
    signedIn: hasSignedIn(m, signedInIds),
    printedAt: m.welcome_card_printed_at || null,
    printedBy: nameById.get(m.welcome_card_printed_by) || null,
  })
  let residents
  if (scope === "nologin") {
    residents = noLogin
  } else if (scope === "houses") {
    // Houses where nobody has signed in, counting no-login residents as
    // living there; their rows are listed too so no such house is hidden.
    const { none } = housesNotSignedIn(occupants, signedInIds)
    residents = sortForWalking([
      ...all.filter(m => none.has(houseKey(m))).map(row),
      ...noLogin.filter(r => none.has(houseKey(r))),
    ])
  } else {
    residents = sortForWalking(filterForScope(all, scope, signedInIds)).map(row)
  }
  // Every home in the village (122), so the house numbers are out of all
  // homes, not just the ones with a resident loaded. If the list can't be
  // read the screen says so in its wording instead of showing a wrong total.
  const { data: homes, error: homesErr } = await supa.from("properties").select("ref")
  if (homesErr) console.error("welcome-cards: could not read properties", homesErr.message)
  const houses = houseStats(occupants, signedInIds, homesErr || !homes?.length ? null : homes.map(h => h.ref))
  if (!isAdmin) {
    // Committee: residents they may make a pack for, nothing else. The
    // counts stay (they are totals, no names).
    const allowed = new Set(all.filter(m => committeeMayPack(m, hasSignedIn(m, signedInIds))).map(m => m.id))
    return NextResponse.json({
      admin: false,
      residents: residents.filter(r => allowed.has(r.id)),
      neverCount: all.filter(m => !hasSignedIn(m, signedInIds)).length,
      noLoginCount: noLogin.length,
      houses,
      helpLine: await readHelpLine(),
    })
  }
  return NextResponse.json({
    admin: true,
    packIntro: await readSetting(PACK_INTRO_KEY),
    residents,
    neverCount: all.filter(m => !hasSignedIn(m, signedInIds)).length,
    noLoginCount: noLogin.length,
    houses,
    helpLine: await readHelpLine(),
  })
}

export async function POST(req) {
  const who = await requireAccess(req)
  if (!who) return NextResponse.json({ error: "Admins and committee only" }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  if (body.action === "pack") return makePacks(req, who, body)
  if (body.action === "set_contact") return setContact(who, body)
  // Everything below is admin only.
  const admin = who.isAdmin ? who.member : null
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 })

  if (body.action === "set_intro") {
    const text = cleanPackIntro(body.text)
    const { error } = await supa.from("settings")
      .upsert({ key: PACK_INTRO_KEY, value: text, updated_at: new Date().toISOString() }, { onConflict: "key" })
    if (error) return NextResponse.json({ error: "Could not save the opening paragraph." }, { status: 500 })
    return NextResponse.json({ ok: true, packIntro: text })
  }

  if (body.action === "set_help") {
    const text = String(body.text || "").trim().slice(0, 120)
    const { error } = await supa.from("settings")
      .upsert({ key: HELP_SETTING_KEY, value: text, updated_at: new Date().toISOString() }, { onConflict: "key" })
    if (error) return NextResponse.json({ error: "Could not save the help line." }, { status: 500 })
    return NextResponse.json({ ok: true, helpLine: text })
  }

  if (body.action !== "print") return NextResponse.json({ error: "Unknown action" }, { status: 400 })

  // Residents with no login (ids "c-...") have no username to print.
  const ids = [...new Set((body.member_ids || []).filter(id => id && !String(id).startsWith("c-")))]
  if (!ids.length) return NextResponse.json({ error: "Choose at least one resident." }, { status: 400 })
  if (ids.length > MAX_PER_PRINT) return NextResponse.json({ error: `Print at most ${MAX_PER_PRINT} cards at a time.` }, { status: 400 })

  const { data: rows, error } = await supa.from("members")
    .select("id, name, username, house_number, status, is_test, auth_id").in("id", ids)
  if (error) return NextResponse.json({ error: "Could not load residents." }, { status: 500 })
  const members = sortForWalking((rows || []).filter(m => m.status === "active" && !m.is_test && m.username))
  // Anyone asked for but not eligible (deactivated since, no username) is
  // reported back, not silently dropped.
  const eligible = new Set(members.map(m => m.id))
  const skipped = (rows || []).filter(m => !eligible.has(m.id)).map(m => m.name)
  if (rows && rows.length < ids.length) console.error("welcome-cards: ids not found", ids.length - rows.length)

  const origin = new URL(req.url).origin
  const issued = await issueStartingPasswords(members, admin.id, origin)
  const cards = issued.cards
  const failed = [...skipped, ...issued.failed]

  // One PDF for the whole print run (Iain, 2026-10-19), sent back base64 in
  // the JSON so the failed list still arrives alongside it. Passwords are
  // only ever in this response, never stored or logged in clear.
  let pdf = null
  if (cards.length) {
    try {
      const bytes = await buildWelcomeCardsPdf(cards, { site: siteLabel(origin), helpLine: await readHelpLine() })
      pdf = Buffer.from(bytes).toString("base64")
    } catch (e) {
      // Passwords were already reset: say so plainly so the admin reprints.
      console.error("welcome-cards: pdf build failed", e.message)
      return NextResponse.json({ error: "Passwords were reset but the card PDF could not be made. Print these residents again.", failed }, { status: 500 })
    }
  }

  return NextResponse.json({ count: cards.length, pdf, failed })
}

// Welcome packs: one letter per house, each as its own PDF so it can be sent
// to that house. Passwords are only ever in this response (the PDFs and the
// rows the screen uses for Text / Email), never stored or logged in clear.
async function makePacks(req, who, body) {
  const ids = [...new Set((body.member_ids || []).filter(id => id && !String(id).startsWith("c-")))]
  if (!ids.length) return NextResponse.json({ error: "Choose at least one resident." }, { status: 400 })
  if (ids.length > MAX_PER_PACK_RUN) return NextResponse.json({ error: `Make packs for at most ${MAX_PER_PACK_RUN} residents at a time.` }, { status: 400 })

  const { data: rows, error } = await supa.from("members")
    .select("id, name, username, house_number, status, is_test, is_admin, hide_name, auth_id, phone, email").in("id", ids)
  if (error) return NextResponse.json({ error: "Could not load residents." }, { status: 500 })

  let eligible = (rows || []).filter(m => m.status === "active" && !m.is_test && m.username)
  if (!who.isAdmin) {
    // Committee: onboarding only. Checked here, not just hidden on screen.
    const signedInIds = await fetchSignedInAuthIds(supa)
    if (!signedInIds) return NextResponse.json({ error: "Could not check who has signed in. Try again." }, { status: 500 })
    eligible = eligible.filter(m => committeeMayPack(m, hasSignedIn(m, signedInIds)))
  }
  const members = sortForWalking(eligible)
  const ok = new Set(members.map(m => m.id))
  const skipped = (rows || []).filter(m => !ok.has(m.id)).map(m => m.name)
  if (!members.length) return NextResponse.json({ error: "None of those residents can be given a pack.", failed: skipped }, { status: 400 })

  const origin = new URL(req.url).origin
  const { cards, failed: notIssued } = await issueStartingPasswords(members, who.member.id, origin)
  const failed = [...skipped, ...notIssued]
  if (!cards.length) return NextResponse.json({ error: "No passwords could be set. Nothing was changed for these residents.", failed }, { status: 500 })

  const [helpLine, intro, logoPng] = await Promise.all([readHelpLine(), readSetting(PACK_INTRO_KEY), packLogo(origin)])
  const site = siteLabel(origin)
  const packs = []
  try {
    for (const group of groupByHouse(cards)) {
      const bytes = await buildWelcomePackPdf([group], { site, helpLine, intro, logoPng })
      packs.push({
        key: group.key, title: packTitle(group), fileName: packFileName(group),
        pdf: Buffer.from(bytes).toString("base64"),
        residents: group.residents.map(r => ({ id: r.id, name: r.name, username: r.username, pin: r.pin, loginUrl: r.loginUrl, phone: r.phone, email: r.email })),
      })
    }
  } catch (e) {
    // Passwords were already reset: say so plainly so the pack is made again.
    console.error("welcome-cards: pack build failed", e.message)
    return NextResponse.json({ error: "Passwords were reset but the welcome pack could not be made. Make the pack for these residents again.", failed }, { status: 500 })
  }

  return NextResponse.json({ count: cards.length, packs, failed, helpLine, guideUrl: homeScreenGuideUrl(origin) })
}

// Mobile / email typed on a pack row (Iain, 2026-11-19), saved to the
// resident's own members row (members owns phone and email -- migration 030;
// the Auth email is separate and untouched, lib/authEmail.js). Same reach as
// making a pack: admins any active resident, committee only residents they
// may make a pack for. Adds or corrects; never clears.
async function setContact(who, body) {
  const id = String(body.member_id || "")
  if (!id || id.startsWith("c-")) return NextResponse.json({ error: "Choose a resident." }, { status: 400 })
  const clean = cleanPackContact({ phone: body.phone, email: body.email })
  if (clean.error) return NextResponse.json({ error: clean.error }, { status: 400 })

  const { data: m, error } = await supa.from("members")
    .select("id, status, is_test, is_admin, hide_name, auth_id").eq("id", id).maybeSingle()
  if (error) return NextResponse.json({ error: "Could not load the resident." }, { status: 500 })
  if (!m || m.status !== "active" || m.is_test) return NextResponse.json({ error: "Resident not found." }, { status: 404 })
  if (!who.isAdmin) {
    const signedInIds = await fetchSignedInAuthIds(supa)
    if (!signedInIds) return NextResponse.json({ error: "Could not check who has signed in. Try again." }, { status: 500 })
    if (!committeeMayPack(m, hasSignedIn(m, signedInIds))) return NextResponse.json({ error: "You can't change this resident's details." }, { status: 403 })
  }

  const { data: saved, error: upErr } = await supa.from("members").update(clean.fields).eq("id", id).select("phone, email").single()
  if (upErr) {
    console.error("welcome-cards: contact update failed", id, upErr.message)
    return NextResponse.json({ error: "Could not save. Try again." }, { status: 500 })
  }
  return NextResponse.json({ ok: true, phone: saved.phone || null, email: saved.email || null })
}
