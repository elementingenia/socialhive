import { createClient } from "@supabase/supabase-js"

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function GET() {
  const { data, error } = await supa.from("hub_settings").select("hub_type, welcome_text")
  if (error) return Response.json({ error: error.message }, { status: 500 })
  // Return as { movies: "...", bookclub: "...", ... }
  const out = {}
  for (const row of data || []) out[row.hub_type] = row.welcome_text || ""
  return Response.json(out)
}

export async function PATCH(req) {
  const { hub_type, welcome_text, user_id } = await req.json()
  if (!hub_type) return Response.json({ error: "hub_type required" }, { status: 400 })

  // Verify admin
  const { data: member } = await supa.from("members").select("is_admin").eq("id", user_id).single()
  if (!member?.is_admin) return Response.json({ error: "Forbidden" }, { status: 403 })

  const { error } = await supa
    .from("hub_settings")
    .update({ welcome_text, updated_at: new Date().toISOString(), updated_by: user_id })
    .eq("hub_type", hub_type)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
