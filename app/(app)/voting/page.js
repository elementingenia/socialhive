"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { authedFetch } from "@/lib/getAuthToken"
import { supabase } from "@/lib/supabase"
import { VotingIcon } from "@/components/NavIcons"
import { FormattedText } from "@/lib/textFormatter"
import { sydneyTodayStr } from "@/lib/date"

const INPUT = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: "10px",
  border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
  fontSize: "0.95rem", boxSizing: "border-box", fontFamily: "inherit",
}
const BTN_PRIMARY = {
  background: "var(--voting)", color: "#fff", border: "none", borderRadius: "10px",
  padding: "0.7rem 1.1rem", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", width: "100%",
}
const BTN_GHOST = {
  background: "transparent", color: "var(--voting)", border: "1px solid var(--voting)",
  borderRadius: "10px", padding: "0.6rem 1rem", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer",
}
// Round-3 (2026-09-03) fixed the datetime-local mobile overflow with a
// tighter-padded style; round-4 (same day) replaced the datetime-local
// input entirely with ClosingDateTimeField (date + hour-only select) per
// Iain's follow-up review, which made that overflow fix moot -- see
// ClosingDateTimeField's own comment below for the current approach.
// Format a Date as a local "YYYY-MM-DDTHH:mm" string for a <input
// type="datetime-local"> default value -- deliberately NOT
// toISOString().slice(...), which is UTC and would show the wrong local
// time (same class of bug this repo's ESLint rule already bans for
// date-only derivations; this is the timestamp equivalent).
function toLocalDatetimeInput(d) {
  const pad = n => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const ALL_HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))

// Iain, 2026-09-03 round-4 review: "There is no obvious way to close the
// calendar picker for the Closing Date/Time" + "Time should only be hours,
// no minutes required." Replaces the single native datetime-local input
// (whose combined date+time widget has no obvious dismiss on some
// browsers/OSes, on top of the mobile overflow already fixed in round-3)
// with a plain native `type="date"` (already used everywhere else in this
// app with no complaints -- tap a day, it closes itself) plus a small
// hour-only <select> styled to match this app's standing form-control
// convention. Minutes are always :00 -- not offered at all, since a
// closing time genuinely doesn't need minute precision. Keeps the same
// "YYYY-MM-DDTHH:mm" string contract the rest of this file already uses
// for closesAtInput/closesAt, so nothing downstream (setClosesAt/save)
// needed to change.
function ClosingDateTimeField({ value, onChange }) {
  const [datePart, timePart] = value ? value.split("T") : ["", ""]
  const hourPart = timePart ? timePart.slice(0, 2) : ""

  function setDate(d) {
    onChange(d ? `${d}T${hourPart || "12"}:00` : "")
  }
  function setHour(h) {
    if (!h) return
    onChange(`${datePart || sydneyTodayStr()}T${h}:00`)
  }

  const selectStyle = {
    padding: "0.7rem 0.6rem", borderRadius: "10px", border: "1px solid var(--border)",
    background: "var(--surface)", color: "var(--text)", fontSize: "0.95rem",
    fontFamily: "inherit", appearance: "none", WebkitAppearance: "none", flex: 1,
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      <input type="date" style={{ ...INPUT, flex: 2 }} value={datePart} min={sydneyTodayStr()} onChange={e => setDate(e.target.value)} />
      <select value={hourPart} onChange={e => setHour(e.target.value)} style={selectStyle}>
        <option value="" disabled>Hour</option>
        {ALL_HOURS_24.map(hh => <option key={hh} value={hh}>{hh}:00</option>)}
      </select>
    </div>
  )
}

function typeBtnStyle(active) {
  return {
    flex: 1, padding: "0.45rem 0.6rem", borderRadius: "8px", fontWeight: 600, fontSize: "0.8rem",
    border: `1px solid ${active ? "var(--voting)" : "var(--border)"}`,
    background: active ? "var(--voting)" : "var(--surface)",
    color: active ? "#fff" : "var(--text)", cursor: "pointer", fontFamily: "inherit",
  }
}

const STATUS_LABEL = { draft: "Draft", open: "Open", closed: "Closed", published: "Published" }
const STATUS_COLOUR = { draft: "var(--text-dim)", open: "#16a34a", closed: "var(--amber-dark)", published: "var(--voting)" }

export default function VotingHubPage() {
  const router = useRouter()
  const [events, setEvents] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [canManage, setCanManage] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState("")
  const [welcomeText, setWelcomeText] = useState("")

  async function load() {
    const res = await authedFetch("/api/voting")
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setError(json.error || "Could not load voting events"); return }
    setEvents(json.events || [])
    setIsAdmin(!!json.isAdmin)
    setCanManage(!!json.canManage)
  }

  useEffect(() => {
    load()
    fetch("/api/hub-settings").then(r => r.json()).then(d => setWelcomeText(d.voting?.text || "")).catch(() => {})
  }, [])

  return (
    <div style={{ padding: "1rem", maxWidth: "640px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
        <span style={{ color: "var(--voting)", lineHeight: 0 }}><VotingIcon size={32} /></span>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0 }}>Voting</h1>
      </div>

      {canManage && (
        <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem" }}>
          <button style={BTN_PRIMARY} onClick={() => setShowCreate(v => !v)}>
            {showCreate ? "Cancel" : "+ New Vote"}
          </button>
          {isAdmin && <button style={BTN_GHOST} onClick={() => router.push("/voting/manage")}>Manage</button>}
        </div>
      )}

      <WelcomeBanner text={welcomeText} />

      {error && <div style={{ color: "var(--terracotta)", marginBottom: "1rem" }}>{error}</div>}

      {showCreate && <CreateEventForm onCreated={() => { setShowCreate(false); load() }} />}

      {events === null && <div style={{ color: "var(--text-dim)" }}>Loading…</div>}
      {events !== null && events.length === 0 && (
        <div style={{ color: "var(--text-dim)", padding: "2rem 0", textAlign: "center" }}>
          No votes have been run yet.
        </div>
      )}
      {(events || []).map(e => (
        <EventCard key={e.id} event={e} isAdmin={isAdmin} canManage={canManage} canManageEvent={e.canManageEvent} onChanged={load} />
      ))}
    </div>
  )
}

function CreateEventForm({ onCreated }) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [eligibilityMode, setEligibilityMode] = useState("per_resident")
  const [voteMode, setVoteMode] = useState("single")
  const [maxSelections, setMaxSelections] = useState(2)
  const [allowSelfVote, setAllowSelfVote] = useState(true)
  const [visOutcome, setVisOutcome] = useState("residents")
  const [visTurnout, setVisTurnout] = useState("residents")
  const [coordinator, setCoordinator] = useState(null)
  // Each choice is either free text (a plain option like "Yes"/"No", or a
  // motion name) or a resident (a real member_id) -- Iain, 2026-09-02: a
  // resident option is imperative, since "Allow candidates to vote for
  // themselves" (allow_self_vote / validateSelfVote in lib/voting.js) can
  // only ever mean anything for a choice that's actually tied to a real
  // member_id. Free-text choices are unaffected by that toggle -- there's
  // no "self" to detect.
  const [choices, setChoices] = useState([
    { type: "text", label: "", candidate_member_id: null },
    { type: "text", label: "", candidate_member_id: null },
  ])
  const [members, setMembers] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    supabase.from("members").select("id, name").order("name")
      .then(({ data }) => setMembers(data || []))
  }, [])

  function setChoice(i, patch) {
    setChoices(cs => cs.map((c, idx) => idx === i ? { ...c, ...patch } : c))
  }
  function addChoice() { setChoices(cs => [...cs, { type: "text", label: "", candidate_member_id: null }]) }
  function removeChoice(i) { setChoices(cs => cs.filter((_, idx) => idx !== i)) }

  // Iain, 2026-09-03 round-3 review: "How Many choices a voter can pick
  // should be numerical based on choices configured" -- the max-selections
  // field was a free number input with no relationship to the Choices list
  // above it, so it could be set higher than the number of real choices
  // (or left stale after choices were removed). Bound it to the actual
  // filled-in choice count instead.
  const filledChoiceCount = Math.max(2, choices.filter(c => (c.label || "").trim()).length)
  useEffect(() => {
    setMaxSelections(m => {
      const n = Number(m) || 2
      return Math.min(Math.max(n, 2), filledChoiceCount)
    })
  }, [filledChoiceCount])

  async function save() {
    setError("")
    const cleanChoices = choices
      .map(c => ({ ...c, label: (c.label || "").trim() }))
      .filter(c => c.label)
    if (!title.trim()) return setError("Title is required")
    if (cleanChoices.length < 2) return setError("At least two choices are required")
    if (cleanChoices.some(c => c.type === "resident" && !c.candidate_member_id)) {
      return setError("Pick a resident for every resident choice, or switch it to free text")
    }

    setSaving(true)
    const res = await authedFetch("/api/voting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || null,
        eligibility_mode: eligibilityMode,
        vote_mode: voteMode,
        max_selections: voteMode === "multi" ? Number(maxSelections) || null : null,
        allow_self_vote: allowSelfVote,
        results_visibility_outcome: visOutcome,
        results_visibility_turnout: visTurnout,
        coordinator_id: coordinator || null,
        choices: cleanChoices.map(c => ({ label: c.label, candidate_member_id: c.candidate_member_id || null })),
      }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return setError(json.error || "Could not create vote")
    onCreated()
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "1rem", marginBottom: "1rem" }}>
      <div style={{ fontWeight: 700, marginBottom: "0.75rem" }}>New Vote</div>

      <label style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Title</label>
      <input style={{ ...INPUT, marginBottom: "0.6rem" }} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Committee Election 2027" />

      <label style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Description (optional)</label>
      <textarea style={{ ...INPUT, marginBottom: "0.6rem", minHeight: "70px" }} value={description} onChange={e => setDescription(e.target.value)} />

      <label style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Choices</label>
      {choices.map((c, i) => {
        const takenIds = new Set(choices.filter((_, idx) => idx !== i).map(o => o.candidate_member_id).filter(Boolean))
        return (
          <ChoiceRow key={i} choice={c} index={i} members={members} takenIds={takenIds}
            onChange={patch => setChoice(i, patch)}
            onRemove={choices.length > 2 ? () => removeChoice(i) : null} />
        )
      })}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.8rem" }}>
        <button style={BTN_GHOST} onClick={addChoice}>+ Add choice</button>
      </div>

      <div style={{ marginBottom: "0.9rem" }}>
        <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: "0.3rem" }}>Who can vote</label>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button type="button" style={typeBtnStyle(eligibilityMode === "per_resident")} onClick={() => setEligibilityMode("per_resident")}>One Vote per Resident</button>
          <button type="button" style={typeBtnStyle(eligibilityMode === "per_household")} onClick={() => setEligibilityMode("per_household")}>One Vote per Household</button>
        </div>
      </div>

      <div style={{ marginBottom: "0.9rem" }}>
        <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: "0.3rem" }}>How many choices can a voter pick</label>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button type="button" style={typeBtnStyle(voteMode === "single")} onClick={() => setVoteMode("single")}>Exactly one</button>
          <button type="button" style={typeBtnStyle(voteMode === "multi")} onClick={() => setVoteMode("multi")}>More than one</button>
        </div>
      </div>
      {voteMode === "multi" && (
        <>
          <label style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Maximum number of choices</label>
          <input
            type="number" min={2} max={filledChoiceCount} style={{ ...INPUT, marginBottom: "0.2rem" }}
            value={maxSelections}
            onChange={e => setMaxSelections(Math.min(Math.max(Number(e.target.value) || 2, 2), filledChoiceCount))}
          />
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.6rem" }}>
            Between 2 and {filledChoiceCount} — the number of choices configured above
          </div>
        </>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem", fontSize: "0.9rem" }}>
        <input type="checkbox" checked={allowSelfVote} onChange={e => setAllowSelfVote(e.target.checked)} />
        Allow candidates to vote for themselves
      </label>
      <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.6rem" }}>
        Only applies to Resident choices below — a resident can't be blocked from voting for a plain text option.
      </div>

      <div style={{ marginBottom: "0.9rem" }}>
        <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: "0.3rem" }}>Who can see the result</label>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button type="button" style={typeBtnStyle(visOutcome === "residents")} onClick={() => setVisOutcome("residents")}>All residents</button>
          <button type="button" style={typeBtnStyle(visOutcome === "admin_only")} onClick={() => setVisOutcome("admin_only")}>Admins only</button>
        </div>
      </div>

      <div style={{ marginBottom: "0.8rem" }}>
        <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: "0.3rem" }}>Who can see how many people voted</label>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button type="button" style={typeBtnStyle(visTurnout === "residents")} onClick={() => setVisTurnout("residents")}>All residents</button>
          <button type="button" style={typeBtnStyle(visTurnout === "admin_only")} onClick={() => setVisTurnout("admin_only")}>Admins only</button>
        </div>
      </div>

      <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: "0.3rem" }}>Coordinator (optional)</label>
      <div style={{ marginBottom: "0.8rem" }}>
        <CoordPicker members={members} value={coordinator} onChange={setCoordinator} />
      </div>

      {error && <div style={{ color: "var(--terracotta)", marginBottom: "0.6rem", fontSize: "0.85rem" }}>{error}</div>}
      <button style={BTN_PRIMARY} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save as Draft"}</button>
    </div>
  )
}

// A single choice on the create-vote form -- either free text (a plain
// option/motion, no self-vote concept) or a resident (a real member_id,
// which is what lets "Allow candidates to vote for themselves" actually do
// anything -- see validateSelfVote in lib/voting.js). Resident search is
// live/2-char-minimum per this app's dropdown-with-many-options convention
// (Info > Contacts, OwnersManager.js), not a native <select> of 165 names.
function ChoiceRow({ choice, index, members, takenIds, onChange, onRemove }) {
  const [search, setSearch] = useState("")

  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 2) return []
    return members.filter(m => !takenIds.has(m.id) && (m.name || "").toLowerCase().includes(q)).slice(0, 20)
  }, [search, members, takenIds])

  function pickResident(m) {
    onChange({ type: "resident", candidate_member_id: m.id, label: m.name })
    setSearch("")
  }
  function switchType(type) {
    if (type === choice.type) return
    onChange({ type, candidate_member_id: null, label: type === "text" ? "" : choice.label })
    setSearch("")
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "10px", padding: "0.6rem", marginBottom: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem" }}>
        <button type="button" style={typeBtnStyle(choice.type === "text")} onClick={() => switchType("text")}>Free text</button>
        <button type="button" style={typeBtnStyle(choice.type === "resident")} onClick={() => switchType("resident")}>Resident</button>
        {onRemove && <button type="button" style={{ ...BTN_GHOST, padding: "0.45rem 0.6rem", flex: "0 0 auto" }} onClick={onRemove}>✕</button>}
      </div>

      {choice.type === "text" ? (
        <input style={INPUT} value={choice.label} onChange={e => onChange({ label: e.target.value })} placeholder={`Choice ${index + 1}`} />
      ) : choice.candidate_member_id ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0.75rem", borderRadius: "8px", background: "var(--surface2)" }}>
          <span style={{ fontWeight: 600 }}>{choice.label}</span>
          <button type="button" style={{ ...BTN_GHOST, padding: "0.3rem 0.6rem", fontSize: "0.78rem" }} onClick={() => onChange({ candidate_member_id: null, label: "" })}>Change</button>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <input style={INPUT} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search residents by name (min 2 characters)" />
          {results.length > 0 && (
            <div style={{ position: "absolute", zIndex: 5, top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", marginTop: "0.25rem", maxHeight: "220px", overflowY: "auto" }}>
              {results.map(m => (
                <div key={m.id} onClick={() => pickResident(m)} style={{ padding: "0.6rem 0.75rem", cursor: "pointer", borderBottom: "1px solid var(--border)" }}>{m.name}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Coordinator picker for a voting event -- same custom dropdown-with-search
// pattern as Show Time/Social/Clubs' own CoordPicker (app/(app)/screenings/
// page.js), not a native <select> of every resident's name, and not shared
// as a component since each hub's copy has already drifted slightly (colour
// token, "username" fallback) -- kept local and voting-coloured here too.
function CoordPicker({ members, value, onChange }) {
  const chosen = members.find(m => m.id === value) || null
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  const filtered = members.filter(m => !query || (m.name || "").toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div onClick={() => { setOpen(o => !o); setQuery("") }}
        role="button" tabIndex={0} aria-haspopup="listbox" aria-expanded={open}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(o => !o); setQuery("") } }}
        style={{ ...INPUT, color: chosen ? "var(--text)" : "var(--text-dim)", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", border: `1.5px solid ${open ? "var(--voting)" : "var(--border)"}` }}>
        <span>{chosen ? chosen.name : "— No coordinator —"}</span>
        <span style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>▾</span>
      </div>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 60, overflow: "hidden" }}>
          <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
            <input autoFocus type="text" placeholder="Search name…" value={query} onChange={e => setQuery(e.target.value)}
              style={{ width: "100%", border: "none", background: "transparent", color: "var(--text)", fontSize: "0.9rem", outline: "none", fontFamily: "inherit" }} />
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {value && (
              <div onClick={() => { onChange(null); setOpen(false) }}
                style={{ padding: "0.65rem 1rem", cursor: "pointer", fontSize: "0.85rem", color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
                — Clear selection —
              </div>
            )}
            {filtered.map(m => (
              <div key={m.id} onClick={() => { onChange(m.id); setOpen(false) }}
                style={{ padding: "0.65rem 1rem", cursor: "pointer", background: m.id === value ? "rgba(124,58,237,0.08)" : "transparent", borderBottom: "1px solid var(--border)", fontWeight: m.id === value ? 700 : 400, fontSize: "0.88rem", color: m.id === value ? "var(--voting)" : "var(--text)" }}>
                {m.name}
              </div>
            ))}
            {filtered.length === 0 && <div style={{ padding: "0.9rem 1rem", fontSize: "0.85rem", color: "var(--text-dim)" }}>No match</div>}
          </div>
        </div>
      )}
    </div>
  )
}

// Welcome banner for the Voting hub, same pattern as Show Time's
// WelcomeBanner (app/(app)/movies/page.js) -- reads hub_settings.voting.text
// via GET /api/hub-settings and is dismissible per-browser (localStorage).
// Iain, 2026-09-02 review: "The Voting Hub Welcome Message is not
// appearing?" -- root cause confirmed by grep: this page never fetched
// hub-settings or rendered a banner at all, unlike every other hub.
const VOTING_WELCOME_KEY = "voting_welcome_dismissed"
// Iain, 2026-09-03 round-4 review: "Welcome tile should be the hub colour as
// the fill and text the colour selected in the Admin/Voting option." This
// was rendering as a bordered/tinted card -- the OLD Happenings Home style
// from before that section's 2026-08-28 readability rework -- while every
// other hub's own welcome banner (Show Time/Social/Library) renders as a
// genuine SOLID hub-colour fill, and Admin > Page Texts > Voting's own
// RichEditor preview (bg="tile" -- see HubTextSection.js/lib/hubSections.js)
// already previews it that way. The editor and the live page had drifted
// apart -- same class of bug as BUG-033 (Home's Page Texts preview not
// matching its real page), just the reverse direction here. Rebuilt to
// match Show Time's WelcomeBanner (app/(app)/movies/page.js) exactly: solid
// var(--voting) fill, white base text, dangerouslySetInnerHTML for the
// admin's saved rich text (their own inline Black/White colour choice from
// the RichEditor toolbar travels with the HTML), FormattedText as a
// fallback for any legacy plain-string value.
function WelcomeBanner({ text }) {
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    try { setDismissed(localStorage.getItem(VOTING_WELCOME_KEY) === "1") } catch {}
  }, [])
  if (!text) return null
  const isHtml = /<[a-z][\s\S]*>/i.test(text)
  if (dismissed) {
    return (
      <button onClick={() => {
        try { localStorage.removeItem(VOTING_WELCOME_KEY) } catch { /* ignore */ }
        setDismissed(false)
      }}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "var(--voting)", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", padding: "0 0 0.75rem", fontFamily: "inherit" }}>
        <span style={{ fontSize: "1rem" }}>ℹ</span> Show welcome message
      </button>
    )
  }
  return (
    <div style={{ background: "var(--voting)", borderRadius: "14px", padding: "0.9rem 1rem", marginBottom: "1rem", position: "relative" }}>
      <div style={{ fontSize: "0.88rem", lineHeight: 1.55, color: "#fff", paddingRight: "1.2rem" }}>
        {isHtml
          ? <span dangerouslySetInnerHTML={{ __html: text }} />
          : <FormattedText text={text} c1Colour="var(--voting)" c2Colour="var(--text-dim)" />}
      </div>
      <button onClick={() => {
        try { localStorage.setItem(VOTING_WELCOME_KEY, "1") } catch { /* ignore */ }
        setDismissed(true)
      }}
        style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: "1rem", cursor: "pointer", lineHeight: 1, padding: 4 }}
        aria-label="Dismiss">×</button>
    </div>
  )
}

function EventCard({ event, isAdmin, canManage, canManageEvent, onChanged }) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState(null)
  const [closesAtInput, setClosesAtInput] = useState("")
  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const [editing, setEditing] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  // Iain, 2026-09-03 round-4 review: "When vote is submitted, the user
  // should be able to see what they voted for." Ballots are structurally
  // anonymous (see lib/voting.js's header comment -- no member_id on
  // voting_ballots at all), so this can only ever be an honest same-
  // session echo of the choices just picked, never something re-fetched
  // after a reload. Set once, right after a successful cast; stays sticky
  // for the rest of this page view.
  const [justVoted, setJustVoted] = useState(null)

  async function loadDetail() {
    const res = await authedFetch(`/api/voting/${event.id}`)
    const json = await res.json().catch(() => ({}))
    if (res.ok) setDetail(json)
  }

  useEffect(() => { if (expanded && !detail) loadDetail() }, [expanded, detail])

  // detail.canManageEvent is fresher (recomputed server-side against the
  // latest coordinator_id) than the list-derived canManageEvent prop -- use
  // it once loaded, fall back to the prop before the detail fetch resolves.
  const canManageThis = detail ? !!detail.canManageEvent : !!canManageEvent

  async function doOpen() {
    setMsg(""); setBusy(true)
    const res = await authedFetch(`/api/voting/${event.id}/open`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setMsg(json.error || "Could not open this vote")
    onChanged(); loadDetail()
  }

  // Iain, 2026-09-03 round-4 review: "Once a user click OPEN for a voting
  // event, the OPEN option should revert to CLOSE - leaving it as open is
  // confusing." Manual early close -- see app/api/voting/[id]/close/route.js
  // for why this is "bring closes_at forward to now" rather than a new
  // status. Two-step confirm (not a raw window.confirm) to match this
  // page's own lightweight in-component pattern rather than pulling in a
  // separate Modal component for one action.
  async function doClose() {
    setMsg(""); setBusy(true)
    const res = await authedFetch(`/api/voting/${event.id}/close`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    setConfirmClose(false)
    if (!res.ok) return setMsg(json.error || "Could not close this vote")
    onChanged(); loadDetail()
  }

  async function setClosesAt() {
    if (!closesAtInput) return setMsg("Set a closing date/time first")
    setMsg(""); setBusy(true)
    // closes_at is set via the open action's own body when opening; for a
    // still-Draft event we patch it in directly before opening.
    const res = await authedFetch(`/api/voting/${event.id}/open`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closes_at: new Date(closesAtInput).toISOString() }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setMsg(json.error || "Could not open this vote")
    onChanged(); loadDetail()
  }

  async function castVote() {
    if (selected.length === 0) return setMsg("Select at least one option")
    setMsg(""); setBusy(true)
    const res = await authedFetch(`/api/voting/${event.id}/vote`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choice_ids: selected }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setMsg(json.error || "Could not record your vote")
    // Iain, 2026-09-03 round-4 review: "Current design state they have
    // voted twice - repetitive" -- this used to ALSO setMsg("Your vote has
    // been recorded.") on top of the separate "✓ You've voted in this
    // ballot." block that renders once detail.myParticipation is set below,
    // so a successful vote showed two near-identical confirmations at once.
    // Now just captures which choices were picked (labels, from the
    // choices already loaded into `detail` -- not re-fetched from the
    // anonymous ballot) so the single confirmation block can say what was
    // voted for instead of a generic "recorded".
    const labels = (detail?.choices || []).filter(c => selected.includes(c.id)).map(c => c.label)
    setJustVoted(labels)
    loadDetail(); onChanged()
  }

  async function doPublish() {
    setMsg(""); setBusy(true)
    const res = await authedFetch(`/api/voting/${event.id}/publish`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setMsg(json.error || "Could not publish results")
    onChanged(); loadDetail()
  }

  // Iain, 2026-09-03 round-4 review: "User max votes should be pro-active
  // not re-active - if two choices only out of three, when two choices are
  // made they simply should not be able to make a 3rd choice rather than
  // allowing them to select 3 only to find out after that they can only
  // select 2." The server (validateBallotSelection, lib/voting.js) already
  // enforced this correctly -- the gap was purely client-side, where
  // nothing stopped a 4th checkbox tick until Cast failed with a server
  // error. Now refuses to add past max_selections client-side; unticking
  // one always frees up a slot again, and choosing FEWER than the max
  // remains completely fine (this only ever blocks going OVER).
  function toggleChoice(id) {
    const mode = detail?.event?.vote_mode
    if (mode === "single") { setSelected([id]); return }
    const max = detail?.event?.max_selections || (detail?.choices || []).length
    setSelected(sel => {
      if (sel.includes(id)) return sel.filter(x => x !== id)
      if (sel.length >= max) return sel
      return [...sel, id]
    })
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "1rem", marginBottom: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.4rem" }}>
        <div style={{ cursor: "pointer", flex: 1, minWidth: 0 }} onClick={() => setExpanded(v => !v)}>
          <div style={{ fontWeight: 700 }}>{event.title}</div>
          {/* Iain, 2026-09-03 round-4 review: "Each event Tile should
              display the Title AND the Description" -- description was
              already returned by GET /api/voting (the list route), just
              never rendered until a card was expanded. Shown here on the
              collapsed tile itself now; the expanded detail view below
              still repeats it (detail.event.description), which is fine --
              same description, just visible at both states rather than
              hidden until expand. */}
          {event.description && <div style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: "0.15rem" }}>{event.description}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {canManageThis && (event.status === "draft" || event.status === "open") && (
            <button
              style={{ ...BTN_GHOST, padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}
              onClick={e => { e.stopPropagation(); setExpanded(true); setEditing(v => !v) }}
            >
              {editing ? "Cancel edit" : "Edit"}
            </button>
          )}
          <span style={{ cursor: "pointer" }} onClick={() => setExpanded(v => !v)}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: STATUS_COLOUR[event.status], border: `1px solid ${STATUS_COLOUR[event.status]}`, borderRadius: "999px", padding: "0.15rem 0.6rem" }}>
              {STATUS_LABEL[event.status]}
            </span>
          </span>
        </div>
      </div>

      {expanded && detail && editing && (
        <EditEventForm
          event={detail.event}
          choices={detail.choices}
          onSaved={() => { setEditing(false); onChanged(); loadDetail() }}
          onCancel={() => setEditing(false)}
        />
      )}

      {expanded && detail && !editing && (
        <div style={{ marginTop: "0.75rem" }}>
          {detail.event.description && <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>{detail.event.description}</p>}
          {detail.coordinatorName && <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: "-0.4rem" }}>Coordinator: {detail.coordinatorName}</p>}

          {event.status === "draft" && canManageThis && (
            <div style={{ marginBottom: "0.6rem" }}>
              <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: "0.3rem" }}>Closing date/time</label>
              <div style={{ marginBottom: "0.5rem" }}>
                <ClosingDateTimeField value={closesAtInput} onChange={setClosesAtInput} />
              </div>
              <button style={BTN_PRIMARY} disabled={busy} onClick={setClosesAt}>Open this vote</button>
            </div>
          )}

          {/* Iain, 2026-09-03 round-4 review: "Once a user click OPEN for a
              voting event, the OPEN option should revert to CLOSE - leaving
              it as open is confusing." Manual early close, admin/Owner/
              coordinator only -- see doClose() and app/api/voting/[id]/
              close/route.js. Two-step confirm since this genuinely ends the
              vote for everyone. */}
          {event.status === "open" && canManageThis && (
            <div style={{ marginBottom: "0.6rem" }}>
              {!confirmClose ? (
                <button style={BTN_GHOST} disabled={busy} onClick={() => setConfirmClose(true)}>Close this vote now</button>
              ) : (
                <div style={{ background: "var(--amber-light)", borderLeft: "3px solid var(--amber)", borderRadius: "8px", padding: "0.6rem", fontSize: "0.85rem" }}>
                  <div style={{ marginBottom: "0.5rem" }}>Close voting now, ahead of its scheduled closing time? This can't be undone.</div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button style={{ ...BTN_PRIMARY, background: "var(--terracotta)", width: "auto", padding: "0.5rem 0.9rem" }} disabled={busy} onClick={doClose}>Yes, close it</button>
                    <button style={{ ...BTN_GHOST, padding: "0.5rem 0.9rem" }} disabled={busy} onClick={() => setConfirmClose(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {event.status === "open" && !detail.myParticipation && detail.eligibility?.eligible && (
            <div style={{ marginBottom: "0.6rem" }}>
              {/* Iain, 2026-09-03 round-4 review, item 6 -- proactive, not
                  reactive, max-selection guidance and enforcement. */}
              <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "0.4rem" }}>
                {detail.event.vote_mode === "single"
                  ? "Choose one option."
                  : (() => {
                      const max = detail.event.max_selections || (detail.choices || []).length
                      return `Choose up to ${max} option${max === 1 ? "" : "s"} — choosing fewer is fine.`
                    })()}
              </div>
              {(detail.choices || []).map(c => {
                const max = detail.event.max_selections || (detail.choices || []).length
                const atMax = detail.event.vote_mode !== "single" && selected.length >= max && !selected.includes(c.id)
                return (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0", borderBottom: "1px solid var(--border)", opacity: atMax ? 0.5 : 1 }}>
                    <input
                      type={detail.event.vote_mode === "single" ? "radio" : "checkbox"}
                      name="voting-choice" checked={selected.includes(c.id)} disabled={atMax}
                      onChange={() => toggleChoice(c.id)}
                    />
                    {c.label}
                  </label>
                )
              })}
              <button style={{ ...BTN_PRIMARY, marginTop: "0.6rem" }} disabled={busy} onClick={castVote}>Cast my vote</button>
            </div>
          )}

          {/* Iain, 2026-09-03 round-4 review, item 7 -- was two overlapping
              confirmations ("✓ You've voted in this ballot." here PLUS a
              separate "Your vote has been recorded." msg from castVote()).
              Now one block: right after casting (justVoted set, this
              session only) it names the actual choices; on a later reload
              (justVoted null -- votes are structurally anonymous, so this
              can't be re-derived from the server) it falls back to the
              same plain confirmation as before. */}
          {event.status === "open" && detail.myParticipation && (
            <div style={{ color: "#16a34a", fontWeight: 600, marginBottom: "0.6rem" }}>
              ✓ {justVoted && justVoted.length > 0 ? `You voted for: ${justVoted.join(", ")}.` : "You've voted in this ballot."}
            </div>
          )}

          {event.status === "open" && !detail.myParticipation && !detail.eligibility?.eligible && (
            <div style={{ color: "var(--terracotta)", marginBottom: "0.6rem" }}>{detail.eligibility.reason}</div>
          )}

          {(event.status === "closed" || event.status === "published") && (
            <div style={{ marginBottom: "0.6rem" }}>
              {detail.turnout && <div style={{ fontSize: "0.9rem", marginBottom: "0.4rem" }}>{detail.turnout.votesCast} vote{detail.turnout.votesCast === 1 ? "" : "s"} cast</div>}
              {detail.results && detail.results.map(r => (
                <div key={r.choice_id} style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0" }}>
                  <span>{r.label}</span><strong>{r.votes}</strong>
                </div>
              ))}
              {!detail.results && !detail.turnout && <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Results aren't visible to you for this vote.</div>}
            </div>
          )}

          {event.status === "closed" && canManageThis && (
            <PublishReview eventId={event.id} onPublish={doPublish} busy={busy} />
          )}

          {/* msg is now error-only -- the one success case it used to
              carry ("Your vote has been recorded.") was removed as part of
              round-4 item 7's duplicate-confirmation fix above, since that
              string is what this colour check was matching on. */}
          {msg && <div style={{ fontSize: "0.85rem", color: "var(--terracotta)" }}>{msg}</div>}
        </div>
      )}
    </div>
  )
}

// Edit an existing event -- Draft gets the full create-form field set
// (eligibility/vote mode/choices included, since nothing has been voted on
// yet); Open is metadata-only (title/description/closing time/coordinator/
// visibility) -- eligibility_mode, vote_mode and choices are locked server-
// side once a vote is open (see the PATCH route's own comment for why).
// Iain, 2026-09-02 review: "When an event is in draft or open once created
// there is no Edit option for the Admin/Owner/EC."
function EditEventForm({ event, choices: initialChoices, onSaved, onCancel }) {
  const isDraft = event.status === "draft"
  const [title, setTitle] = useState(event.title || "")
  const [description, setDescription] = useState(event.description || "")
  const [eligibilityMode, setEligibilityMode] = useState(event.eligibility_mode || "per_resident")
  const [voteMode, setVoteMode] = useState(event.vote_mode || "single")
  const [maxSelections, setMaxSelections] = useState(event.max_selections || 2)
  const [allowSelfVote, setAllowSelfVote] = useState(event.allow_self_vote !== false)
  const [visOutcome, setVisOutcome] = useState(event.results_visibility_outcome || "residents")
  const [visTurnout, setVisTurnout] = useState(event.results_visibility_turnout || "residents")
  const [coordinator, setCoordinator] = useState(event.coordinator_id || null)
  const [closesAt, setClosesAt] = useState(event.closes_at ? toLocalDatetimeInput(new Date(event.closes_at)) : "")
  const [choices, setChoices] = useState(
    (initialChoices || []).map(c => ({ type: c.candidate_member_id ? "resident" : "text", label: c.label, candidate_member_id: c.candidate_member_id || null }))
  )
  const [members, setMembers] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    supabase.from("members").select("id, name").order("name").then(({ data }) => setMembers(data || []))
  }, [])

  function setChoice(i, patch) { setChoices(cs => cs.map((c, idx) => idx === i ? { ...c, ...patch } : c)) }
  function addChoice() { setChoices(cs => [...cs, { type: "text", label: "", candidate_member_id: null }]) }
  function removeChoice(i) { setChoices(cs => cs.filter((_, idx) => idx !== i)) }

  // Same bound-to-actual-choices fix as CreateEventForm -- see its comment.
  const filledChoiceCount = Math.max(2, choices.filter(c => (c.label || "").trim()).length)
  useEffect(() => {
    setMaxSelections(m => {
      const n = Number(m) || 2
      return Math.min(Math.max(n, 2), filledChoiceCount)
    })
  }, [filledChoiceCount])

  async function save() {
    setError("")
    if (!title.trim()) return setError("Title is required")
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      coordinator_id: coordinator || null,
      results_visibility_outcome: visOutcome,
      results_visibility_turnout: visTurnout,
      closes_at: closesAt ? new Date(closesAt).toISOString() : null,
    }
    if (isDraft) {
      const cleanChoices = choices.map(c => ({ ...c, label: (c.label || "").trim() })).filter(c => c.label)
      if (cleanChoices.length < 2) return setError("At least two choices are required")
      if (cleanChoices.some(c => c.type === "resident" && !c.candidate_member_id)) {
        return setError("Pick a resident for every resident choice, or switch it to free text")
      }
      payload.eligibility_mode = eligibilityMode
      payload.vote_mode = voteMode
      payload.max_selections = voteMode === "multi" ? Number(maxSelections) || null : null
      payload.allow_self_vote = allowSelfVote
      payload.choices = cleanChoices.map(c => ({ label: c.label, candidate_member_id: c.candidate_member_id || null }))
    }

    setSaving(true)
    const res = await authedFetch(`/api/voting/${event.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return setError(json.error || "Could not save changes")
    onSaved()
  }

  return (
    <div style={{ background: "var(--surface2)", border: "1px solid var(--voting)", borderRadius: "12px", padding: "0.9rem", marginTop: "0.75rem" }}>
      <div style={{ fontWeight: 700, marginBottom: "0.6rem" }}>Edit vote{!isDraft ? " (Open — details only)" : ""}</div>

      <label style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Title</label>
      <input style={{ ...INPUT, marginBottom: "0.6rem" }} value={title} onChange={e => setTitle(e.target.value)} />

      <label style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Description (optional)</label>
      <textarea style={{ ...INPUT, marginBottom: "0.6rem", minHeight: "60px" }} value={description} onChange={e => setDescription(e.target.value)} />

      {isDraft && (
        <>
          <label style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Choices</label>
          {choices.map((c, i) => {
            const takenIds = new Set(choices.filter((_, idx) => idx !== i).map(o => o.candidate_member_id).filter(Boolean))
            return (
              <ChoiceRow key={i} choice={c} index={i} members={members} takenIds={takenIds}
                onChange={patch => setChoice(i, patch)}
                onRemove={choices.length > 2 ? () => removeChoice(i) : null} />
            )
          })}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.8rem" }}>
            <button style={BTN_GHOST} onClick={addChoice}>+ Add choice</button>
          </div>

          <div style={{ marginBottom: "0.9rem" }}>
            <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: "0.3rem" }}>Who can vote</label>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <button type="button" style={typeBtnStyle(eligibilityMode === "per_resident")} onClick={() => setEligibilityMode("per_resident")}>One Vote per Resident</button>
              <button type="button" style={typeBtnStyle(eligibilityMode === "per_household")} onClick={() => setEligibilityMode("per_household")}>One Vote per Household</button>
            </div>
          </div>

          <div style={{ marginBottom: "0.9rem" }}>
            <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: "0.3rem" }}>How many choices can a voter pick</label>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <button type="button" style={typeBtnStyle(voteMode === "single")} onClick={() => setVoteMode("single")}>Exactly one</button>
              <button type="button" style={typeBtnStyle(voteMode === "multi")} onClick={() => setVoteMode("multi")}>More than one</button>
            </div>
          </div>
          {voteMode === "multi" && (
            <>
              <label style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Maximum number of choices</label>
              <input
                type="number" min={2} max={filledChoiceCount} style={{ ...INPUT, marginBottom: "0.2rem" }}
                value={maxSelections}
                onChange={e => setMaxSelections(Math.min(Math.max(Number(e.target.value) || 2, 2), filledChoiceCount))}
              />
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.6rem" }}>
                Between 2 and {filledChoiceCount} — the number of choices configured above
              </div>
            </>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.8rem", fontSize: "0.9rem" }}>
            <input type="checkbox" checked={allowSelfVote} onChange={e => setAllowSelfVote(e.target.checked)} />
            Allow candidates to vote for themselves
          </label>
        </>
      )}

      <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: "0.3rem" }}>Closing date/time</label>
      <div style={{ marginBottom: "0.6rem" }}>
        <ClosingDateTimeField value={closesAt} onChange={setClosesAt} />
      </div>

      <div style={{ marginBottom: "0.9rem" }}>
        <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: "0.3rem" }}>Who can see the result</label>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button type="button" style={typeBtnStyle(visOutcome === "residents")} onClick={() => setVisOutcome("residents")}>All residents</button>
          <button type="button" style={typeBtnStyle(visOutcome === "admin_only")} onClick={() => setVisOutcome("admin_only")}>Admins only</button>
        </div>
      </div>

      <div style={{ marginBottom: "0.9rem" }}>
        <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: "0.3rem" }}>Who can see how many people voted</label>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button type="button" style={typeBtnStyle(visTurnout === "residents")} onClick={() => setVisTurnout("residents")}>All residents</button>
          <button type="button" style={typeBtnStyle(visTurnout === "admin_only")} onClick={() => setVisTurnout("admin_only")}>Admins only</button>
        </div>
      </div>

      <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: "0.3rem" }}>Coordinator (optional)</label>
      <div style={{ marginBottom: "0.8rem" }}>
        <CoordPicker members={members} value={coordinator} onChange={setCoordinator} />
      </div>

      {error && <div style={{ color: "var(--terracotta)", marginBottom: "0.6rem", fontSize: "0.85rem" }}>{error}</div>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button style={BTN_PRIMARY} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>
        <button style={BTN_GHOST} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function PublishReview({ eventId, onPublish, busy }) {
  const [anomalies, setAnomalies] = useState(null)

  useEffect(() => {
    authedFetch(`/api/voting/${eventId}/publish`)
      .then(r => r.json())
      .then(json => setAnomalies(json.anomalies || []))
      .catch(() => setAnomalies([]))
  }, [eventId])

  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.6rem", marginTop: "0.4rem" }}>
      {anomalies === null && <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Checking for household duplicates…</div>}
      {anomalies !== null && anomalies.length > 0 && (
        <div style={{ background: "var(--amber-light)", borderLeft: "3px solid var(--amber)", borderRadius: "8px", padding: "0.6rem", marginBottom: "0.6rem", fontSize: "0.85rem" }}>
          ⚠ {anomalies.length} household{anomalies.length === 1 ? "" : "s"} recorded more than one vote — review before publishing.
        </div>
      )}
      {anomalies !== null && anomalies.length === 0 && (
        <div style={{ color: "#16a34a", fontSize: "0.85rem", marginBottom: "0.6rem" }}>No household duplicates found.</div>
      )}
      <button style={BTN_PRIMARY} disabled={busy} onClick={onPublish}>Publish results</button>
    </div>
  )
}
