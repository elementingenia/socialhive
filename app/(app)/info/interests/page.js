"use client"
import { formatAddress } from "@/lib/address"
import { useState, useEffect, useMemo } from "react"
import { useUser } from "@/lib/UserContext"
import { authedFetch } from "@/lib/getAuthToken"
import { resolveMemberName } from "@/lib/memberName"
import { groupByInterest } from "@/lib/interests"
import { SKILLS_DISCLAIMER } from "@/components/InterestsPicker"
import { COLOUR } from "@/components/ResidentEditPanel"
import PhoneActions from "@/components/PhoneActions"

// Info > Interests & Skills (Iain, 2026-10-03). One tab for both lists
// (B7, S6): a "Search Skills" toggle reveals ONLY the skill pills, a
// "Search Interests" toggle ONLY the interest pills. Originally Info >
// Interests (Iain, 2026-10-03). Browse "Ask me about" by interest
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
  const [pendingDir, setPendingDir] = useState({})
  const [skillsDir, setSkillsDir] = useState({})
  const [skillsPendingDir, setSkillsPendingDir] = useState({})
  const [skillNotes, setSkillNotes] = useState({})
  const [mode, setMode] = useState(null)              // "skill" | "interest" | null
  const [members, setMembers] = useState({})
  const [error, setError] = useState(false)
  const [open, setOpen] = useState(null)              // label of the open pill

  useEffect(() => {
    let alive = true
    // Names/house/phone come with the directory from the server (BUG-072) --
    // the browser can no longer read other residents' contact columns.
    authedFetch("/api/interests/directory").then(r => (r.ok ? r.json() : Promise.reject(r))).then(d => {
      if (!alive) return
      setMembers(d.people || {})
      setPendingDir(d.pending || {})
      setSkillsDir(d.skills || {})
      setSkillsPendingDir(d.skillsPending || {})
      setSkillNotes(d.skillNotes || {})
      setDirectory(d.directory || {})
    }).catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [])

  // Only residents we can actually name; drop interests left with nobody.
  const groups = useMemo(() => {
    if (!directory) return []
    // Approved and unapproved (amber) together, A-Z. Labels can't collide:
    // migration 120's live-label unique index covers approved + pending.
    const [approvedMap, pendingMap] = mode === "skill" ? [skillsDir, skillsPendingDir] : [directory, pendingDir]
    if (!mode) return []
    const tagged = [
      ...groupByInterest(approvedMap).map(g => ({ ...g, pending: false })),
      ...groupByInterest(pendingMap).map(g => ({ ...g, pending: true })),
    ]
    return tagged
      .map(g => ({ ...g, memberIds: g.memberIds.filter(id => members[id]) }))
      .filter(g => g.memberIds.length > 0)
      .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }))
  }, [mode, directory, pendingDir, skillsDir, skillsPendingDir, members])

  const people = (ids) => ids
    .map(id => members[id])
    .map(m => ({ m, name: resolveMemberName(m, { viewerId: me?.id, selfLabel: "You" }) }))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))

  const openGroup = groups.find(g => g.label === open)
  const isSkill = mode === "skill"
  const noun = isSkill ? "skills" : "interests"
  const pickMode = (m) => { setOpen(null); setMode(cur => (cur === m ? null : m)) }
  const toggleStyle = (on) => ({
    flex: 1, minHeight: 44, padding: "0.5rem 0.75rem", borderRadius: 12, fontFamily: "inherit",
    fontSize: "0.92rem", fontWeight: 700, cursor: "pointer", border: `1.5px solid ${COLOUR}`,
    background: on ? COLOUR : "var(--surface)", color: on ? "#fff" : "var(--text)",
  })

  return (
    <div style={{ padding: "1rem", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.85rem" }}>
        <button type="button" aria-pressed={mode === "skill"} onClick={() => pickMode("skill")} style={toggleStyle(mode === "skill")}>Search Skills</button>
        <button type="button" aria-pressed={mode === "interest"} onClick={() => pickMode("interest")} style={toggleStyle(mode === "interest")}>Search Interests</button>
      </div>

      {mode && (
        <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", lineHeight: 1.5, marginBottom: "0.85rem" }}>
          {isSkill
            ? <>Neighbours who can lend a hand. Tap a skill to see who. <em>{SKILLS_DISCLAIMER}</em></>
            : "Neighbours who are happy to be asked about something. Tap an interest to see who."}
          {groups.some(g => g.pending) && " Orange ones are new suggestions not yet approved."}
        </div>
      )}

      {error ? (
        <div style={{ fontSize: "0.88rem", color: "#e53e3e" }}>Couldn&apos;t load interests. Please try again shortly.</div>
      ) : directory === null ? (
        <div style={{ fontSize: "0.88rem", color: "var(--text-dim)" }}>Loading…</div>
      ) : !mode ? (
        <div style={{ fontSize: "0.88rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
          Choose <strong>Search Skills</strong> to find a neighbour who can help with something, or{" "}
          <strong>Search Interests</strong> to find people who share an interest.
        </div>
      ) : groups.length === 0 ? (
        <div style={{ fontSize: "0.88rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
          No one has added {noun} yet. Add yours from <strong>Update Profile</strong> under{" "}
          <strong>{isSkill ? "I can help with" : "Ask me about"}</strong>.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
            {groups.map(g => {
              const on = g.label === open
              // Unapproved suggestions: same amber treatment as on Profile
              // (PR #180) -- dashed amber border, amber fill when open.
              const look = g.pending
                ? { border: "1.5px dashed var(--amber-dark)", background: on ? "var(--amber-light)" : "var(--surface)", color: on ? "#78350f" : "var(--text)" }
                : { background: on ? COLOUR : "var(--surface)", color: on ? "#fff" : "var(--text)" }
              return (
                <button key={g.label} type="button" aria-expanded={on}
                  aria-label={g.pending ? `${g.label}, ${g.memberIds.length}, new and not yet approved` : undefined}
                  onClick={() => setOpen(on ? null : g.label)}
                  style={{ ...pillBase, fontWeight: on ? 700 : 600, ...look }}>
                  {g.label} ({g.memberIds.length})
                </button>
              )
            })}
          </div>

          {openGroup && (
            <div style={{ marginTop: "0.9rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "0.75rem 0.9rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.4rem" }}>
                {isSkill ? `Can help with ${openGroup.label}` : `Ask about ${openGroup.label}`}
              </div>
              {openGroup.pending && (
                <div style={{ fontSize: "0.78rem", color: "var(--amber-dark)", marginTop: "-0.2rem", marginBottom: "0.4rem" }}>
                  New suggestion, not yet approved by the admins.
                </div>
              )}
              {people(openGroup.memberIds).map(({ m, name }) => (
                <div key={m.id} style={{ padding: "0.5rem 0", borderTop: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.92rem", color: "var(--text)" }}>{name}</span>
                    {(m.house_number || m.street_name) && (
                      <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>· {formatAddress(m.house_number, m.street_name)}</span>
                    )}
                  </div>
                  {isSkill && skillNotes[m.id]?.[openGroup.label] && (
                    <div style={{ fontSize: "0.82rem", color: "var(--text)", marginTop: "0.2rem", fontStyle: "italic" }}>
                      &ldquo;{skillNotes[m.id][openGroup.label]}&rdquo;
                    </div>
                  )}
                  {/* Own line under the name: the number + Call/Message don't
                      fit beside a name at phone width (2026-10-03). */}
                  {m.phone && m.id !== me?.id && (
                    <div style={{ marginTop: "0.35rem" }}><PhoneActions phone={m.phone} colour={COLOUR} /></div>
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
