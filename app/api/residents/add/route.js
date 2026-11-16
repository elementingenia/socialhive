import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { randomInt } from "crypto"
import { isAreaOwner } from "@/lib/areaAuth"
import { createMemberAccount } from "@/lib/createMemberAccount"
import { generateStartingPin } from "@/lib/welcomeCards"
import { suggestUsername } from "@/lib/usernames"
import { validateAddResident, residentCategoryIds, possibleDuplicates } from "@/lib/addResident"
import { normaliseHouseNumber, resolveStreetId } from "@/lib/address"
import { loadStreets } from "@/lib/streetsServer"
import { isBuiltInCategory } from "@/lib/contactCategories"
import { memberFieldsFromContact } from "@/lib/accounts"

// Add Resident (Iain, 2026-11-16): a new resident's Contacts details and
// their login in one step. Admins (Info > Contacts, Sign-in Help) and
// Committee hub Owners (Committee page) can use it, with the same fields
// (decision: "same as admins"). Nobody can make an Admin or a Private
// resident here -- those stay on Edit Resident, admin only.
//
// The starting password is generated and never shown from this route: the
// form goes straight on to make the welcome pack (app/api/admin/welcome-cards
// action "pack"), which issues the password the resident is given.

export const dynamic = "force-dynamic"

async function requireAccess(req) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!token) return null
  const { data: { user } } = await supa.auth.getUser(token)
  if (!user) return null
  const { data: member } = await supa.from("members").select("id, is_admin").eq("auth_id", user.id).maybeSingle()
  if (!member) return null
  if (member.is_admin) return member
  return (await isAreaOwner(member.id, "hub", "committee")) ? member : null
}

async function residentsCategory() {
  const { data, error } = await supa.from("contact_categories").select("id, name, active")
  if (error) return { error }
  const cats = data || []
  return { residentsId: cats.find(c => isBuiltInCategory(c.name))?.id || null, validIds: cats.filter(c => c.active !== false).map(c => c.id) }
}

// GET ?name=&house= -- a suggested username, and anyone already on file who
// may be the same person.
export async function GET(req) {
  const who = await requireAccess(req)
  if (!who) return NextResponse.json({ error: "Admins and committee only" }, { status: 403 })
  const q = new URL(req.url).searchParams
  const name = (q.get("name") || "").trim()
  const house = normaliseHouseNumber(q.get("house") || "")

  const [{ data: members, error: e1 }, { data: contacts, error: e2 }, cat] = await Promise.all([
    supa.from("members").select("id, name, username, house_number, status, is_test"),
    supa.from("contacts").select("id, name, house_number, member_id, active, contact_category_members(category_id)").is("member_id", null),
    residentsCategory(),
  ])
  if (e1 || e2 || cat.error) return NextResponse.json({ error: "Could not check existing residents. Try again." }, { status: 500 })

  const active = (members || []).filter(m => m.status === "active" && !m.is_test)
  const liveContacts = (contacts || []).filter(c => c.active !== false)
    .map(c => ({ ...c, categoryIds: (c.contact_category_members || []).map(x => x.category_id) }))
  return NextResponse.json({
    suggestion: name ? suggestUsername(name, (members || []).map(m => m.username)) : null,
    matches: name || house.value ? possibleDuplicates({ name, house_number: house.ok ? house.value : null }, active, liveContacts, cat.residentsId) : [],
  })
}

export async function POST(req) {
  const who = await requireAccess(req)
  if (!who) return NextResponse.json({ error: "Admins and committee only" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const name = String(body.name || "").trim()
  const displayName = String(body.display_name || "").trim() || name
  const username = String(body.username || "").trim()
  const err = validateAddResident({ name, display_name: displayName, username, house_number: body.house_number })
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const house = normaliseHouseNumber(body.house_number ?? "")
  const street = resolveStreetId(body.street_id, await loadStreets(supa))
  if (!street.ok) return NextResponse.json({ error: street.error }, { status: 400 })

  const cat = await residentsCategory()
  if (cat.error || !cat.residentsId) return NextResponse.json({ error: "Could not read the contact categories. Try again." }, { status: 500 })
  let categoryIds = residentCategoryIds(body.category_ids, cat.residentsId, cat.validIds)
  const title = String(body.title || "").trim() || null

  // "Use this entry": give an existing no-login Residents entry the login,
  // instead of making a second entry for the same person.
  let contactId = null
  let usedEntry = null
  if (body.contact_id) {
    const { data: c, error: cErr } = await supa.from("contacts")
      .select("id, member_id, house_number, street_id, phone, email, contact_category_members(category_id)").eq("id", body.contact_id).maybeSingle()
    if (cErr) return NextResponse.json({ error: "Could not read that Contacts entry. Try again." }, { status: 500 })
    const isResident = (c?.contact_category_members || []).some(x => x.category_id === cat.residentsId)
    if (!c || c.member_id || !isResident) return NextResponse.json({ error: "That Contacts entry already has a login or is not a resident." }, { status: 409 })
    contactId = c.id
    usedEntry = c
    // Keep the categories the entry already had.
    categoryIds = residentCategoryIds([...(body.category_ids || []), ...c.contact_category_members.map(x => x.category_id)], cat.residentsId, cat.validIds)
  }

  // Using an existing entry: anything the form left blank is taken from it
  // (BUG-106 rule, lib/accounts.js memberFieldsFromContact).
  const fields = usedEntry ? memberFieldsFromContact(usedEntry) : {}
  if (house.value) fields.house_number = house.value
  if (street.value) fields.street_id = street.value
  const phone = String(body.phone || "").trim()
  if (phone) fields.phone = phone
  const email = String(body.email || "").trim()
  if (email) fields.email = email

  const made = await createMemberAccount({
    name, displayName, username, pin: generateStartingPin(randomInt), fields,
  })
  if (made.error) return NextResponse.json({ error: made.error }, { status: made.status })
  const memberId = made.member_id

  // The Contacts entry: Title/Role and categories live there (the members row
  // owns name, phone, email and address -- migration 030). Only needed when
  // there is something to file beyond Residents, or an entry to link.
  const needsEntry = contactId || title || categoryIds.length > 1
  if (needsEntry) {
    let entryId = contactId
    if (contactId) {
      const { error } = await supa.from("contacts").update({ member_id: memberId, active: true, ...(title ? { title } : {}) }).eq("id", contactId).is("member_id", null)
      if (error) entryId = null
    } else {
      const { data, error } = await supa.from("contacts").insert({ member_id: memberId, name, title, active: true }).select("id").single()
      entryId = error ? null : data.id
    }
    if (entryId) {
      await supa.from("contact_category_members").delete().eq("contact_id", entryId)
      await supa.from("contact_category_members").insert(categoryIds.map(cid => ({ contact_id: entryId, category_id: cid })))
    } else {
      // The login exists; only the extra Contacts details failed.
      console.error("residents/add: contacts entry not saved for", memberId)
      return NextResponse.json({ ok: true, member_id: memberId, warning: "The login was made, but the Title/Role and categories were not saved. Add them from Edit Resident." })
    }
  }

  return NextResponse.json({ ok: true, member_id: memberId })
}
