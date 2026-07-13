import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function getMember(token) {
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: member } = await supabaseAdmin
    .from("members").select("id").eq("auth_id", user.id).single()
  return member
}

// POST — save (or refresh) a browser's push subscription for the calling
// resident. endpoint is globally unique per browser install, so this is an
// upsert keyed on it rather than a plain insert -- re-subscribing the same
// device (e.g. after clearing the permission and re-enabling it) shouldn't
// create a duplicate row.
export async function POST(req) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  const { subscription } = await req.json()
  const endpoint = subscription?.endpoint
  const p256dh = subscription?.keys?.p256dh
  const auth = subscription?.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from("push_subscriptions").upsert({
    member_id: member.id, endpoint, p256dh, auth,
    user_agent: req.headers.get("user-agent") || null,
  }, { onConflict: "endpoint" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// DELETE — remove a subscription (resident turned the toggle off, or the
// browser handed back a new subscription and the old endpoint needs
// clearing). Scoped to the caller's own member_id so one resident can't
// delete another's row even if they somehow had the endpoint string.
export async function DELETE(req) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  const { endpoint } = await req.json()
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 })

  const { error } = await supabaseAdmin
    .from("push_subscriptions").delete().eq("member_id", member.id).eq("endpoint", endpoint)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
