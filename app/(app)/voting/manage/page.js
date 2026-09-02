"use client"
import { useEffect, useState } from "react"
import { useUser } from "@/lib/UserContext"
import ManageAreaScreen from "@/components/ManageAreaScreen"
import HubTextSection from "@/components/HubTextSection"
import { authedFetch } from "@/lib/getAuthToken"

// Voting hub's "Manage this area" screen. Owners reach the same screen as
// admins (ManageAreaScreen's own admin-or-Owner gate), but the show/hide
// toggle below is rendered admin-only -- Iain, 2026-09-02: "Hub toggle
// admin-only, event creation via existing requireAdminOrAreaOwner." An
// Owner still gets full use of /voting itself (create/open/vote/publish,
// gated on canManage there); this screen's extra admin-only control is
// purely "does this hub exist for residents at all right now."
export default function VotingManagePage() {
  return (
    <ManageAreaScreen contextType="hub" contextKey="voting" backHref="/voting"
      backLabel="Voting" title="Manage Voting" colour="var(--voting)">
      <VotingEnabledToggle />
      <HubTextSection sectionKey="voting" />
    </ManageAreaScreen>
  )
}

function VotingEnabledToggle() {
  const { isAdmin } = useUser()
  const [enabled, setEnabled] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/hub-settings").then(r => r.json()).then(json => setEnabled(!!json?.voting?.enabled)).catch(() => setEnabled(true))
  }, [])

  if (!isAdmin) return null // Owners never see this control at all -- not just disabled

  async function toggle() {
    setError(""); setSaving(true)
    const next = !enabled
    const res = await authedFetch("/api/hub-settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hub_type: "voting", enabled: next }),
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
        Voting is occasional, not a routine tile — turn it off between voting periods so it doesn't sit on Home unused.
      </p>
      {enabled === null ? (
        <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</div>
      ) : (
        <button onClick={toggle} disabled={saving} style={{
          background: enabled ? "var(--voting)" : "transparent",
          color: enabled ? "#fff" : "var(--voting)",
          border: "1px solid var(--voting)", borderRadius: "10px",
          padding: "0.6rem 1.1rem", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer",
        }}>
          {enabled ? "Visible on Home — tap to hide" : "Hidden from Home — tap to show"}
        </button>
      )}
      {error && <div style={{ color: "var(--terracotta)", fontSize: "0.85rem", marginTop: "0.5rem" }}>{error}</div>}
    </div>
  )
}
