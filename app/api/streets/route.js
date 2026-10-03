import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { normaliseStreetName, streetKey, validateStreetName } from "@/lib/address"
import { loadStreets } from "@/lib/streetsServer"

// Street names (migration 122, Iain 2026-10-03).
//   GET              -> any signed-in resident: the list, A-Z. Admins also
//                       get how many residents/contacts use each street.
//   POST   {name}    -> admin: add a street
//   PATCH  {id,name} -> admin: rename (everyone on that street follows)
//   DELETE {id}      -> admin: delete, refused while anyone still uses it
export const dynamic = "force-dynamic"

async function viewer(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "")
  if (!token) return null
  const { data: { user } } = await supa.auth.getUser(token)
  if (!user) return null
  const { data } = await supa.from("members").select("id, is_admin").eq("auth_id", user.id).maybeSingle()
  return data || null
}

async function clash(name, exceptId) {
  const key = streetKey(name)
  return (await loadStreets(supa)).find(s => s.id !== exceptId && streetKey(s.name) === key) || null
}

export async function GET(req) {
  const me = await viewer(req)
  if (!me) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  const streets = await loadStreets(supa)
  if (!me.is_admin) return NextResponse.json({ streets })

  const [{ data: m }, { data: c }] = await Promise.all([
    supa.from("members").select("street_id").eq("status", "active").not("street_id", "is", null),
    supa.from("contacts").select("street_id").is("member_id", null).not("street_id", "is", null),
  ])
  const counts = {}
  for (const r of [...(m || []), ...(c || [])]) counts[r.street_id] = (counts[r.street_id] || 0) + 1
  return NextResponse.json({ streets: streets.map(s => ({ ...s, count: counts[s.id] || 0 })) })
}

export async function POST(req) {
  const me = await viewer(req)
  if (!me?.is_admin) return NextResponse.json({ error: "Admin only" }, { status: 403 })
  const { name } = await req.json().catch(() => ({}))
  const err = validateStreetName(name)
  if (err) return NextResponse.json({ error: err }, { status: 400 })
  const dup = await clash(name)
  if (dup) return NextResponse.json({ error: `"${dup.name}" is already on the list.` }, { status: 409 })
  const { error } = await supa.from("streets").insert({ name: normaliseStreetName(name) })
  if (error) return NextResponse.json({ error: "Could not add that street." }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req) {
  const me = await viewer(req)
  if (!me?.is_admin) return NextResponse.json({ error: "Admin only" }, { status: 403 })
  const { id, name } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: "Missing street." }, { status: 400 })
  const err = validateStreetName(name)
  if (err) return NextResponse.json({ error: err }, { status: 400 })
  const dup = await clash(name, id)
  if (dup) return NextResponse.json({ error: `"${dup.name}" is already on the list.` }, { status: 409 })
  const { data, error } = await supa.from("streets").update({ name: normaliseStreetName(name) }).eq("id", id).select("id")
  if (error) return NextResponse.json({ error: "Could not rename that street." }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: "That street no longer exists." }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req) {
  const me = await viewer(req)
  if (!me?.is_admin) return NextResponse.json({ error: "Admin only" }, { status: 403 })
  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: "Missing street." }, { status: 400 })

  // Inactive members count too -- the foreign key does, so we'd fail anyway.
  const [{ count: mc }, { count: cc }] = await Promise.all([
    supa.from("members").select("id", { count: "exact", head: true }).eq("street_id", id),
    supa.from("contacts").select("id", { count: "exact", head: true }).eq("street_id", id),
  ])
  const used = (mc || 0) + (cc || 0)
  if (used) {
    return NextResponse.json({
      error: `${used} ${used === 1 ? "person is" : "people are"} still on this street. Rename it instead, or move them to another street first.`,
    }, { status: 409 })
  }
  const { error } = await supa.from("streets").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "Could not delete that street." }, { status: 500 })
  return NextResponse.json({ ok: true })
}
