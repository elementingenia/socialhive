import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { cleanDraft, validateDraft, normaliseAudience, NEW_FEATURES_KEY } from "@/lib/newFeatures"
import { buildFeatureAnnouncementPdf } from "@/lib/featureAnnouncementPdf"
import { sydneyTodayStr } from "@/lib/date"

// Admin > New Features (Scope_Answered, Iain 2026-10-03). Admins only.
//   GET                      -> settings + drafts/approved + recent history
//   GET ?preview=<id>        -> that draft rendered as the real PDF template
//   POST {fields}            -> new draft
//   PATCH {id, fields}       -> edit a draft or approved item
//   PATCH {id, action}       -> approve | unapprove | reject
//   PATCH {settings:{enabled?, audience?}} -> master switch / audience
// Nothing here sends anything -- only the daily 08:30 cron
// (app/api/cron/new-features-announce) announces approved items.
export const dynamic = "force-dynamic"

async function requireAdmin(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "")
  if (!token) return null
  const { data: { user } } = await supa.auth.getUser(token)
  if (!user) return null
  const { data } = await supa.from("members").select("id, is_admin").eq("auth_id", user.id).single()
  return data?.is_admin ? data : null
}

const FIELDS = "id, title, summary, what_it_does, how_to_use, where_to_find, source_ref, status, created_at, updated_at, approved_at, announced_on, document_id"

export async function GET(req) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const previewId = new URL(req.url).searchParams.get("preview")
  if (previewId) {
    const { data: f } = await supa.from("feature_announcements").select(FIELDS).eq("id", previewId).maybeSingle()
    if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const bytes = await buildFeatureAnnouncementPdf({ dateStr: f.announced_on || sydneyTodayStr(), features: [f] })
    return new Response(Buffer.from(bytes), {
      headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" },
    })
  }

  const [{ data: setting }, { data: open, error }, { data: done }] = await Promise.all([
    supa.from("hub_settings").select("enabled, digest_audience").eq("hub_type", NEW_FEATURES_KEY).maybeSingle(),
    supa.from("feature_announcements").select(FIELDS).in("status", ["draft", "approved"]).order("created_at"),
    supa.from("feature_announcements").select(FIELDS + ", document:documents(file_url, title)")
      .eq("status", "announced").order("announced_on", { ascending: false }).limit(30),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    settings: { enabled: !!setting?.enabled, audience: normaliseAudience(setting?.digest_audience), ready: !!setting },
    open: open || [],
    history: done || [],
  })
}

export async function POST(req) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 })
  const draft = cleanDraft(await req.json().catch(() => ({})))
  const err = validateDraft(draft)
  if (err) return NextResponse.json({ error: err }, { status: 400 })
  const { data, error } = await supa.from("feature_announcements")
    .insert({ ...draft, created_by: admin.id }).select(FIELDS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 })
  const body = await req.json().catch(() => ({}))

  if (body.settings) {
    const update = {}
    if (typeof body.settings.enabled === "boolean") update.enabled = body.settings.enabled
    if (body.settings.audience !== undefined) {
      if (!["admins", "community"].includes(body.settings.audience)) {
        return NextResponse.json({ error: "audience must be 'admins' or 'community'" }, { status: 400 })
      }
      update.digest_audience = body.settings.audience
    }
    if (!Object.keys(update).length) return NextResponse.json({ error: "Nothing to change" }, { status: 400 })
    const { error } = await supa.from("hub_settings").update(update).eq("hub_type", NEW_FEATURES_KEY)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const { id, action } = body
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const { data: row } = await supa.from("feature_announcements").select(FIELDS).eq("id", id).maybeSingle()
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!["draft", "approved"].includes(row.status)) {
    return NextResponse.json({ error: "Already announced or rejected — it can't be changed" }, { status: 409 })
  }
  const now = new Date().toISOString()
  let update

  if (action === "approve") {
    const err = validateDraft(row)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
    update = { status: "approved", approved_by: admin.id, approved_at: now }
  } else if (action === "unapprove") {
    update = { status: "draft", approved_by: null, approved_at: null }
  } else if (action === "reject") {
    update = { status: "rejected" }
  } else if (body.fields) {
    const draft = cleanDraft(body.fields)
    const err = validateDraft(draft)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
    update = draft
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  }

  const { data, error } = await supa.from("feature_announcements")
    .update({ ...update, updated_at: now }).eq("id", id).select(FIELDS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
