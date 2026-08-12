import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
export const dynamic = "force-dynamic"
export async function GET() {
  // Try with sub_messages (migration 016). Fall back to welcome_text only (015).
  // Return empty object if table doesn't exist yet.
  const { data, error } = await supa
    .from("hub_settings")
    .select("hub_type, welcome_text, sub_messages, loan_cap")

  if (error) {
    // Column or table missing — try without sub_messages
    const fallback = await supa.from("hub_settings").select("hub_type, welcome_text")
    if (fallback.error) {
      // Table doesn't exist yet — return empty, don't 500
      return Response.json({})
    }
    const out = {}
    for (const row of fallback.data || []) {
      out[row.hub_type] = { text: row.welcome_text || "", subs: [] }
    }
    return Response.json(out)
  }

  const out = {}
  for (const row of data || []) {
    out[row.hub_type] = {
      text: row.welcome_text || "",
      subs: Array.isArray(row.sub_messages) ? row.sub_messages : [],
      loanCap: typeof row.loan_cap === "number" ? row.loan_cap : 3,
    }
  }
  return Response.json(out)
}

export async function PATCH(req) {
  const { hub_type, welcome_text, sub_messages, location_id, loan_cap } = await req.json()
  if (!hub_type) return Response.json({ error: "hub_type required" }, { status: 400 })

  // AUTH FROM THE TOKEN, not from the request body. This previously read a
  // `user_id` out of the JSON and looked up that member's is_admin — so any
  // caller could pass a known admin's id and edit every hub's text. The bearer
  // token is the only thing the client cannot forge.
  const token = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!token) return Response.json({ error: "Unauthorised" }, { status: 401 })
  const { data: { user } } = await supa.auth.getUser(token)
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 })
  const { data: member } = await supa
    .from("members").select("id, is_admin").eq("auth_id", user.id).maybeSingle()
  if (!member?.is_admin) return Response.json({ error: "Forbidden" }, { status: 403 })

  // This route exists BECAUSE hub_settings cannot be written from the client.
  // Migration 015's policy is
  //     USING (EXISTS (SELECT 1 FROM members WHERE id = auth.uid() ...))
  // which compares members.id to the AUTH user id — it can never be true, so
  // every client write is silently filtered to zero rows. The service role used
  // here bypasses RLS. (The foundation RLS rewrite, migration 091, replaces
  // that policy with app_is_admin(), which compares auth_id correctly.)
  const update = { updated_at: new Date().toISOString(), updated_by: member.id }
  if (welcome_text !== undefined) update.welcome_text = welcome_text
  if (sub_messages !== undefined) update.sub_messages = sub_messages
  // null is meaningful here — it clears the hub's nominated venue.
  if (location_id !== undefined) update.location_id = location_id
  // Owner/admin-configurable loan cap (Iain, 2026-08-12: don't hardcode the
  // borrow limit for DVD or the Library — both read this per hub_type).
  if (loan_cap !== undefined) update.loan_cap = loan_cap

  const { error } = await supa
    .from("hub_settings")
    .upsert({ hub_type, ...update }, { onConflict: "hub_type" })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
