import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { requireAdminOrAreaOwner } from "@/lib/areaAuth"
export const dynamic = "force-dynamic"

// Which hub_settings rows an Owner (not just admin) may write, and which
// hub-Owner context_key (space_owners.context_key under context_type='hub')
// governs each. Added 2026-08-12, Part A of the Owner self-service scope —
// 'home' and 'bookclub' (and anything else unmapped) stay admin-only: home
// text isn't scoped to any one area's Owner, and Book Club is deliberately
// unchanged by this work (it's a Groups & Clubs club, not a hub — its own
// notices/settings already go through club-scoped routes).
const HUB_TYPE_TO_OWNER_KEY = {
  movies: "movie",
  movies_suggestions: "movie",
  movies_dvd: "movie",
  social: "social",
  library: "library",
  library_books: "library",
}

export async function GET() {
  // Try with sub_messages (migration 016). Fall back to welcome_text only (015).
  // Return empty object if table doesn't exist yet.
  const { data, error } = await supa
    .from("hub_settings")
    .select("hub_type, welcome_text, sub_messages, loan_cap, enabled")

  if (error) {
    // Column or table missing — try without sub_messages
    const fallback = await supa.from("hub_settings").select("hub_type, welcome_text")
    if (fallback.error) {
      // Table doesn't exist yet — return empty, don't 500
      return Response.json({})
    }
    const out = {}
    for (const row of fallback.data || []) {
      out[row.hub_type] = { text: row.welcome_text || "", subs: [], enabled: true }
    }
    return Response.json(out)
  }

  const out = {}
  for (const row of data || []) {
    out[row.hub_type] = {
      text: row.welcome_text || "",
      subs: Array.isArray(row.sub_messages) ? row.sub_messages : [],
      loanCap: typeof row.loan_cap === "number" ? row.loan_cap : 3,
      // Voting hub show/hide (2026-09-02). Defaults true for every existing
      // hub (migration 088's ALTER TABLE default) -- only 'voting' is seeded
      // false, and only 'voting' currently has any UI reading this field.
      enabled: row.enabled !== false,
    }
  }
  return Response.json(out)
}

export async function PATCH(req) {
  const { hub_type, welcome_text, sub_messages, location_id, loan_cap, enabled } = await req.json()
  if (!hub_type) return Response.json({ error: "hub_type required" }, { status: 400 })

  // AUTH FROM THE TOKEN, not from the request body — the bearer token is the
  // only thing the client cannot forge. Widened 2026-08-12: an Owner of the
  // hub this hub_type belongs to may also write it, not just an admin,
  // matching the Owner self-service model already applied to events/EC view
  // (lib/areaAuth.js) and club notices/settings. hub_types with no Owner
  // mapping (home, bookclub) stay admin-only.
  const ownerKey = HUB_TYPE_TO_OWNER_KEY[hub_type]
  let member
  if (ownerKey) {
    const { error, status, member: m } = await requireAdminOrAreaOwner(req, "hub", ownerKey)
    if (error) return Response.json({ error }, { status })
    member = m
  } else {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) return Response.json({ error: "Unauthorised" }, { status: 401 })
    const { data: { user } } = await supa.auth.getUser(token)
    if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 })
    const { data: m } = await supa
      .from("members").select("id, is_admin").eq("auth_id", user.id).maybeSingle()
    if (!m?.is_admin) return Response.json({ error: "Forbidden" }, { status: 403 })
    member = m
  }

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
  // Hub show/hide toggle -- admin-only, full stop, regardless of whether this
  // hub_type has an Owner mapping above (Iain, 2026-09-02, re: Voting: "Hub
  // toggle admin-only, event creation via existing requireAdminOrAreaOwner").
  // An Owner can still reach this route for welcome_text etc via the branch
  // above; they just can't flip `enabled` even if they got this far.
  if (enabled !== undefined) {
    if (!member.is_admin) return Response.json({ error: "Admins only can show/hide a hub" }, { status: 403 })
    update.enabled = !!enabled
  }
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
