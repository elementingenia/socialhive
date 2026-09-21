"use client"
import { useEffect, useState } from "react"
import { useUser } from "@/lib/UserContext"
import ManageAreaScreen from "@/components/ManageAreaScreen"
import { authedFetch } from "@/lib/getAuthToken"

// Happenings News' "Manage this area" screen -- admin-only, no Owner tier
// (same reasoning as Special Events: this hub spans every other hub's
// events, there's no single natural Owner to delegate it to). Mirrors
// app/(app)/special-events/manage/page.js's shape, plus TWO extra pieces
// Special Events doesn't need: a second (Production) visibility toggle --
// see lib/happeningsNewsTier.js's isHappeningsNewsLive() for why one flag
// isn't enough here -- and the hardcoded 30/90/150-day archive-delay
// dropdown (Iain, 2026-09-21: "The options should be a hard coded lists of
// 30/90/150 days").
export default function HappeningsNewsManagePage() {
  return (
    <ManageAreaScreen contextType="hub" contextKey="happenings_news" backHref="/happenings-news"
      backLabel="Happenings News" title="Manage Happenings News" colour="var(--happenings-news)">
      <VisibilityToggles />
      <ArchiveDelaySetting />
    </ManageAreaScreen>
  )
}

function VisibilityToggles() {
  const { isAdmin } = useUser()
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/hub-settings").then(r => r.json()).then(json => setSettings(json?.happenings_news || {})).catch(() => setSettings({}))
  }, [])

  if (!isAdmin) return null

  async function toggle(field) {
    setError(""); setSaving(true)
    const next = !settings[field]
    const res = await authedFetch("/api/hub-settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hub_type: "happenings_news", [field]: next }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return setError(json.error || "Could not update")
    setSettings(s => ({ ...s, [field]: next }))
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "1rem" }}>
      <div style={{ fontWeight: 700, marginBottom: "0.4rem" }}>Show this Hub to residents</div>
      <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
        Preview and Production are switched independently, so you can test on Preview without it going live for residents.
      </p>
      {settings === null ? (
        <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <button onClick={() => toggle("enabled")} disabled={saving} style={{
            background: settings.enabled ? "var(--happenings-news)" : "transparent",
            color: settings.enabled ? "#fff" : "var(--happenings-news)",
            border: "1px solid var(--happenings-news)", borderRadius: "10px",
            padding: "0.6rem 1.1rem", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", textAlign: "left",
          }}>
            Preview: {settings.enabled ? "Visible — tap to hide" : "Hidden — tap to show"}
          </button>
          <button onClick={() => toggle("production_enabled")} disabled={saving} style={{
            background: settings.production_enabled ? "var(--happenings-news)" : "transparent",
            color: settings.production_enabled ? "#fff" : "var(--happenings-news)",
            border: "1px solid var(--happenings-news)", borderRadius: "10px",
            padding: "0.6rem 1.1rem", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", textAlign: "left",
          }}>
            Production: {settings.production_enabled ? "Live to residents — tap to hide" : "Hidden — tap to go live"}
          </button>
        </div>
      )}
      {error && <div style={{ color: "var(--terracotta)", fontSize: "0.85rem", marginTop: "0.5rem" }}>{error}</div>}
    </div>
  )
}

function ArchiveDelaySetting() {
  const { isAdmin } = useUser()
  const [days, setDays] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/hub-settings").then(r => r.json()).then(json => setDays(json?.happenings_news?.archive_days || 90)).catch(() => setDays(90))
  }, [])

  if (!isAdmin) return null

  async function save(next) {
    setError(""); setSaving(true)
    const res = await authedFetch("/api/hub-settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hub_type: "happenings_news", happenings_news_archive_days: next }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return setError(json.error || "Could not update")
    setDays(next)
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "1rem" }}>
      <div style={{ fontWeight: 700, marginBottom: "0.4rem" }}>Post archiving delay</div>
      <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
        Once a post reaches this age, its photos are shrunk down to save storage — the article text is kept forever either way.
      </p>
      {days === null ? (
        <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {[30, 90, 150].map(opt => (
            <button key={opt} onClick={() => save(opt)} disabled={saving} style={{
              flex: 1, background: days === opt ? "var(--happenings-news)" : "transparent",
              color: days === opt ? "#fff" : "var(--happenings-news)",
              border: "1px solid var(--happenings-news)", borderRadius: "10px",
              padding: "0.6rem 0.5rem", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer",
            }}>
              {opt} days
            </button>
          ))}
        </div>
      )}
      {error && <div style={{ color: "var(--terracotta)", fontSize: "0.85rem", marginTop: "0.5rem" }}>{error}</div>}
    </div>
  )
}
