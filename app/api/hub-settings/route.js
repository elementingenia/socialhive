import { createClient } from "@supabase/supabase-js"

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function GET() {
  const { data, error } = await supa
    .from("hub_settings")
    .select("hub_type, welcome_text, sub_messages")
  if (error) return Response.json({ error: error.message }, { status: 500 })
  // Return as { movies: { text: "...", subs: [...] }, ... }
  const out = {}
  for (const row of data || []) {
    out[row.hub_type] = {
      text: row.welcome_text || "",
      subs: Array.isArray(row.sub_messages) ? row.sub_messages : [],
    }
  }
  return Response.json(out)
}

export async function PATCH(req) {
  const { hub_type, welcome_text, sub_messages, user_id } = await req.json()
  if (!hub_type) return Response.json({ error: "hub_type required" }, { status: 400 })

  // Verify admin
  const { data: member } = await supa.from("members").select("is_admin").eq("id", user_id).single()
  if (!member?.is_admin) return Response.json({ error: "Forbidden" }, { status: 403 })

  const update = { updated_at: new Date().toISOString(), updated_by: user_id }
  if (welcome_text !== undefined) update.welcome_text = welcome_text
  if (sub_messages !== undefined) update.sub_messages = sub_messages

  // Upsert so new hub_types (movies_suggestions, movies_dvd) are created if missing
  const { error } = await supa
    .from("hub_settings")
    .upsert({ hub_type, ...update }, { onConflict: "hub_type" })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
