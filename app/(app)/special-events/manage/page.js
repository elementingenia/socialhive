"use client"
import { useEffect, useState } from "react"
import { useUser } from "@/lib/UserContext"
import ManageAreaScreen from "@/components/ManageAreaScreen"
import { authedFetch } from "@/lib/getAuthToken"

// Special Events hub's "Manage this area" screen -- Iain, 2026-09-04: "Like
// Voting, needs to be a toggle to activate this so it can be off MOST of
// the time... No need for Page text in Admin. No Owner is needed." Mirrors
// app/(app)/voting/manage/page.js's toggle exactly, minus HubTextSection
// (deliberately not rendered here -- that's the "no Page text" instruction)
// and minus any Owner-reachability note, since 'special' has no
// space_owners rows at all: ManageAreaScreen's own admin-or-Owner gate
// degrades to admin-only automatically for this hub.
export default function SpecialEventsManagePage() {
  return (
    <ManageAreaScreen contextType="hub" contextKey="special" backHref="/special-events"
      backLabel="Special Events" title="Manage Special Events" colour="var(--special)">
      <SpecialEventsEnabledToggle />
    </ManageAreaScreen>
  )
}

function SpecialEventsEnabledToggle() {
  const { isAdmin } = useUser()
  const [enabled, setEnabled] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/hub-settings").then(r => r.json()).then(json => setEnabled(!!json?.special?.enabled)).catch(() => setEnabled(false))
  }, [])

  if (!isAdmin) return null // there is no Owner tier for this hub at all

  async function toggle() {
    setError(""); setSaving(true)
    const next = !enabled
    const res = await authedFetch("/api/hub-settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hub_type: "special", enabled: next }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return setError(json.error || "Could not update")
    setEnabled(next)
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "1rem" }}>
      <div style={{ fontWeight: 700, marginBottom: "0.4rem" }}>Show this Hub to residents</div>
      <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
        Special Events is occasional, not a routine tile — turn it off between events so it doesn't sit on Home unused.
      </p>
      {enabled === null ? (
        <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</div>
      ) : (
        <button onClick={toggle} disabled={saving} style={{
          background: enabled ? "var(--special)" : "transparent",
          color: enabled ? "#fff" : "var(--special)",
          border: "1px solid var(--special)", borderRadius: "10px",
          padding: "0.6rem 1.1rem", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer",
        }}>
          {enabled ? "Visible on Home — tap to hide" : "Hidden from Home — tap to show"}
        </button>
      )}
      {error && <div style={{ color: "var(--terracotta)", fontSize: "0.85rem", marginTop: "0.5rem" }}>{error}</div>}
    </div>
  )
}
