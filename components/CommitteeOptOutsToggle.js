"use client"
import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

// Admin/Owner-only expandable list of residents who have opted OUT of
// Committee notifications (committee_notification_optouts -- see
// CommitteeNotifyToggle.js's header comment for why this table is the
// inverse polarity of club_members/hub_followers: everyone is subscribed
// by default, this table only ever holds the exceptions). Iain, 2026-09-16:
// "build the same option as is done for JOIN in other hubs/Groups and
// clubs, but in Committee its just the opposite, a list of those opted
// out" -- same MembersToggle.js pattern (count + expand/collapse name
// list), Admin/Owner-only exactly like that component, but counting and
// listing opt-outs instead of joins. Renders nothing when `visible` is
// false -- no partial/collapsed state for a resident to stumble onto.
export default function CommitteeOptOutsToggle({ colour = "var(--text-dim)", visible }) {
  const [names, setNames] = useState(null) // null = not loaded / not applicable
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!visible) { setNames(null); return }
    let cancelled = false
    supabase.from("committee_notification_optouts").select("member_id, members(name)")
      .then(({ data }) => {
        if (cancelled) return
        const rows = (data || [])
          .map(r => r.members?.name || "Resident")
          .sort((a, b) => a.localeCompare(b))
        setNames(rows)
      })
    return () => { cancelled = true }
  }, [visible])

  if (!visible || names === null) return null

  return (
    <div style={{ display: "inline-flex", flexDirection: "column" }}>
      <button onClick={() => setOpen(o => !o)}
        title={open ? "Hide the list of names" : "See who has opted out"}
        style={{
          background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
          fontSize: "0.78rem", fontWeight: 700, color: colour, padding: "0.3rem 0.35rem",
          display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
        }}>
        🔕 {names.length} opted out {open ? "▲" : "▼"}
      </button>
      {open && (
        names.length === 0 ? (
          <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", padding: "0.1rem 0.4rem 0.5rem" }}>
            No one has opted out
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
