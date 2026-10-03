"use client"
import { useState, useEffect, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import { authedFetch } from "@/lib/getAuthToken"
import { resolveMemberName } from "@/lib/memberName"
import { groupByInterest } from "@/lib/interests"
import { COLOUR } from "@/components/ResidentEditPanel"

// Info > Interests (Iain, 2026-10-03). Browse "Ask me about" by interest
// instead of searching Contacts: one pill per interest that at least one
// visible resident has chosen ("base it on interests that have been used by
// contacts only"), with a count; tap a pill to list those residents, tap
// again to close.
//
// Who appears comes entirely from /api/interests/directory, which already
// strips Private (hide_name), test and inactive residents and non-approved
// chips server-side -- the same source as the Contacts card line, so this
// page can't show anyone Contacts wouldn't. The members read below only
// supplies display name / house # / phone for those ids (same read
// Contacts already does).

const pillBase = {
  minHeight: 40, padding: "0.4rem 0.85rem", borderRadius: 999, fontFamily: "inherit",
  fontSize: "0.88rem", cursor: "pointer", border: `1.5px solid ${COLOUR}`,
}

export default function InterestsBrowsePage() {
  const { member: me } = useUser()
  const [directory, setDirectory] = useState(null)   // null = still loading
  const [members, setMembers] = useState({})
  const [error, setError] = useState(false)
  const [open, setOpen] = useState(null)              // label of the open pill

  useEffect(() => {
    let alive = true
    Promise.all([
      authedFetch("/api/interests/directory").then(r => (r.ok ? r.json() : Promise.reject(r))),
      supabase.from("members").select("id, name, display_name, house_number, phone, hide_name").eq("status", "active"),
    ]).then(([d, m]) => {
      if (!alive) return
      if (m.error) throw m.error
      setMembers(Object.fromEntries((m.data || []).map(x => [x.id, x])))
      setDirectory(d.directory || {})
    }).catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [])

  // Only residents we can actually name; drop interests left with nobody.
  const groups = useMemo(() => {
    if (!directory) return []
    return groupByInterest(directory)
      .map(g => ({ ...g, memberIds: g.memberIds.filter(id => members[id]) }))
      .filter(g => g.memberIds.length > 0)
  }, [directory, members])

  const people = (ids) => ids
    .map(id => members[id])
    .map(m => ({ m, name: resolveMemberName(m, { viewerId: me?.id, selfLabel: "You" }) }))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))

  const openGroup = groups.find(g => g.label === open)

  return (
    <div style={{ padding: "1rem", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", lineHeight: 1.5, marginBottom: "0.85rem" }}>
        Neighbours who are happy to be asked about something. Tap an interest to see who.
      </div>

      {error ? (
        <div style={{ fontSize: "0.88rem", color: "#e53e3e" }}>Couldn&apos;t load interests. Please try again shortly.</div>
      ) : directory === null ? (
        <div style={{ fontSize: "0.88rem", color: "var(--text-dim)" }}>Loading…</div>
      ) : groups.length === 0 ? (
        <div style={{ fontSize: "0.88rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
          No one has added interests yet. Add yours from <strong>Update Profile</strong> under{" "}
          <strong>Ask me about</strong>.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
            {groups.map(g => {
              const on = g.label === open
              return (
                <button key={g.label} type="button" aria-expanded={on}
                  onClick={() => setOpen(on ? null : g.label)}
                  style={{ ...pillBase, fontWeight: on ? 700 : 600,
                    background: on ? COLOUR : "var(--surface)", color: on ? "#fff" : "var(--text)" }}>
                  {g.label} ({g.memberIds.length})
                </button>
              )
            })}
          </div>

          {openGroup && (
            <div style={{ marginTop: "0.9rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "0.75rem 0.9rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.4rem" }}>
                Ask about {openGroup.label}
              </div>
              {people(openGroup.memberIds).map(({ m, name }) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", padding: "0.5rem 0", borderTop: "1px solid var(--border)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.92rem", color: "var(--text)" }}>{name}</div>
                    {m.house_number && (
                      <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>House #{m.house_number}</div>
                    )}
                  </div>
                  {m.phone && m.id !== me?.id && (
                    <a href={`tel:${m.phone}`} style={{ fontSize: "0.88rem", color: COLOUR, textDecoration: "none", fontWeight: 700, whiteSpace: "nowrap" }}>
                      📞 {m.phone}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
