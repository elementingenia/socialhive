import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function getMember(req) {
  const auth  = req.headers.get("authorization") || ""
  const token = auth.replace("Bearer ", "")
  if (!token) return null
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return null

  // Try full select (post-migration); fall back to base columns if not yet migrated
  let { data, error } = await supabase
    .from("members")
    .select("id, name, username, house_number, email, phone, avatar_url, bar_opt_in, hide_name, is_admin")
    .eq("auth_id", user.id).single()

  if (error) {
    const res2 = await supabase
      .from("members")
      .select("id, name, username, house_number, avatar_url, bar_opt_in, is_admin")
      .eq("auth_id", user.id).single()
    data = res2.data
  }
  return data
}

export async function GET(req) {
  const member = await getMember(req)
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json(member)
}

export async function PATCH(req) {
  const member = await getMember(req)
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body    = await req.json()
  const allowed = ["name", "house_number", "email", "phone", "bar_opt_in", "hide_name", "avatar_url"]
  const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)))
  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "No valid fields" }, { status: 400 })

  // Try full update; if new columns don't exist yet, retry with only base columns
  let { data, error } = await supabase
    .from("members").update(updates).eq("id", member.id)
    .select("id, name, username, house_number, email, phone, avatar_url, bar_opt_in, hide_name").single()

  if (error) {
    const baseOnly = ["name", "house_number", "avatar_url", "bar_opt_in"]
    const safe = Object.fromEntries(Object.entries(updates).filter(([k]) => baseOnly.includes(k)))
    if (Object.keys(safe).length > 0) {
      const res2 = await supabase
        .from("members").update(safe).eq("id", member.id)
        .select("id, name, username, house_number, avatar_url, bar_opt_in").single()
      if (res2.error) return NextResponse.json({ error: res2.error.message }, { status: 500 })
      return NextResponse.json(res2.data)
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
