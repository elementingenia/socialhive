"use client"
import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

// Owner/admin-only member count + expandable name list, for a simple
// "join = get notified" membership table (club_members for a Groups & Clubs
// club, hub_followers for a fixed hub like Show Time). Iain, 2026-08-31:
// "For the Hub or Groups club Owners only" -- a resident who has simply
// joined never sees this; only someone who can manage the area does, same
// gate this project already uses for Post notice / the EC panel (isAdmin ||
// isOwner). Renders nothing at all when `visible` is false -- there is no
// partial/collapsed state for a resident to stumble onto.
//
// table:  'club_members' | 'hub_followers'
// column: the table's own key column ('club_id' or 'hub_type')
// value:  the club's id, or the hub_type string
export default function MembersToggle({ table, column, value, colour = "var(--text-dim)", visible }) {
  const [names, setNames] = useState(null) // null = not loaded / not applicable
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!visible || !value) { setNames(null); return }
    let cancelled = false
    supabase.from(table).select("member_id, members(name)").eq(column, value)
      .then(({ data }) => {
        if (cancelled) return
        const rows = (data || [])
          .map(r => r.members?.name || "Resident")
          .sort((a, b) => a.localeCompare(b))
        setNames(rows)
      })
    return () => { cancelled = true }
  }, [visible, table, column, value])

  if (!visible || names === null) return null

  return (
    <div style={{ display: "inline-flex", flexDirection: "column" }}>
      <button onClick={() => setOpen(o => !o)}
        title={open ? "Hide the list of names" : "See who has joined"}
        style={{
          background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
          fontSize: "0.78rem", fontWeight: 700, color: colour, padding: "0.3rem 0.35rem",
          display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
        }}>
        👥 {names.length} member{names.length !== 1 ? "s" : ""} {open ? "▲" : "▼"}
      </button>
      {open && (
        names.length === 0 ? (
          <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", padding: "0.1rem 0.4rem 0.5rem" }}>
            No one has joined yet
          </div>
        ) : (
          <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "0.4rem 0.7rem", marginTop: 2, maxWidth: 300 }}>
            {names.map((n, i) => (
              <div key={i} style={{
                fontSize: "0.8rem", color: "var(--text)", padding: "0.25rem 0",
                borderBottom: i < names.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                {n}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
