"use client"
import { useState, useEffect, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { useOwners } from "@/lib/useOwners"
import AskQuestion from "@/components/AskQuestion"

const inputStyle = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: "10px",
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box",
  fontFamily: "inherit",
}

// Admin control: manage the Owners of a space (hub or club).
// Reads/writes space_owners directly via supabase (RLS: authenticated read,
// admin write) — same client-side pattern as clubs / club_members.
export default function OwnersManager({ contextType, contextKey, hint }) {
  const { owners, loading, reload } = useOwners(contextType, contextKey)
  const [members, setMembers] = useState([])
  const [search, setSearch]   = useState("")
  const [busy, setBusy]       = useState(false)

  useEffect(() => {
    supabase.from("members").select("id, name").order("name")
      .then(({ data }) => setMembers(data || []))
  }, [])

  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 2) return []
    const have = new Set(owners.map(o => o.id))
    return members.filter(m => !have.has(m.id) && (m.name || "").toLowerCase().includes(q)).slice(0, 20)
  }, [search, members, owners])

  async function add(m) {
    setBusy(true)
    await supabase.from("space_owners").insert({
      context_type: contextType, context_key: String(contextKey), member_id: m.id,
    })
    setSearch("")
    await reload()
    setBusy(false)
  }

  async function remove(o) {
    setBusy(true)
    await supabase.from("space_owners").delete()
      .eq("context_type", contextType).eq("context_key", String(contextKey)).eq("member_id", o.id)
    await reload()
    setBusy(false)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      {owners.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {owners.map(o => (
            <span key={o.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 999, padding: "0.3rem 0.35rem 0.3rem 0.75rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>
              {o.name}
              <button type="button" onClick={() => remove(o)} disabled={busy} aria-label={`Remove ${o.name}`}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "1.15rem", height: "1.15rem", borderRadius: 999, border: "none", background: "var(--border)", color: "var(--text)", fontSize: "0.72rem", cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit", lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
      {!loading && owners.length === 0 && (
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>No owners yet — questions here fall back to the app admins until one is added.</div>
      )}

      <div style={{ position: "relative" }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Add an owner — type a name (min 2 chars)…" style={inputStyle} />
        {results.length > 0 && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, zIndex: 50, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", marginTop: "0.25rem", maxHeight: "14rem", overflowY: "auto" }}>
            {results.map(m => (
              <div key={m.id} onClick={() => add(m)}
                style={{ padding: "0.65rem 0.85rem", cursor: "pointer", borderBottom: "1px solid var(--border)", fontSize: "0.88rem", fontWeight: 500 }}>
                {m.name}
              </div>
            ))}
          </div>
        )}
        {search.trim().length >= 2 && results.length === 0 && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, zIndex: 50, padding: "0.65rem 0.85rem", fontSize: "0.85rem", color: "var(--text-dim)", marginTop: "0.25rem" }}>
            No more residents match
          </div>
        )}
      </div>

      {hint && <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>{hint}</div>}
    </div>
  )
}

// Lightweight, read-only display of a space's owners as a contact line.
// Renders nothing if there are no owners. Used on club + hub landings.
export function OwnersContact({ contextType, contextKey, style }) {
  const { owners, loading } = useOwners(contextType, contextKey)
  if (loading || owners.length === 0) return null
  return (
    <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", ...style }}>
      {owners.length > 1 ? "Contacts" : "Contact"}: <span style={{ fontWeight: 600, color: "var(--text)" }}>{owners.map(o => o.name).join(", ")}</span>
    </div>
  )
}


// One-row contact bar for hub/club landings (Iain 2026-07-20): the owner
// name(s) ARE the "ask a question" trigger (bold + underlined = clickable),
// with an optional control (e.g. the hub Join button) on the right — saves a
// row vs. stacking contact + ask + join separately. If a space has no owner
// yet, the trigger falls back to a plain "Ask a question" link (routes to
// admins).
export function ContactBar({ contextType, contextKey, contextLabel, colour = "var(--amber-dark)", right = null, style }) {
  const { owners } = useOwners(contextType, contextKey)
  const names = owners.map(o => o.name).join(", ")
  const link = { background: "none", border: "none", padding: 0, margin: 0, fontFamily: "inherit", fontSize: "0.82rem", fontWeight: 800, textDecoration: "underline", color: colour, cursor: "pointer" }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.6rem", flexWrap: "wrap", ...style }}>
      <AskQuestion contextType={contextType} contextKey={contextKey} contextLabel={contextLabel} colour={colour}
        trigger={(open) => (
          <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
            {owners.length > 0
              ? <>Contact: <button onClick={open} style={link}>{names}</button></>
              : <button onClick={open} style={link}>💬 Ask a question</button>}
          </div>
        )} />
      {right}
    </div>
  )
}
