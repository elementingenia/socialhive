"use client"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { authedFetch } from "@/lib/getAuthToken"
import { supabase } from "@/lib/supabase"
import { VotingIcon } from "@/components/NavIcons"

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

  async function load() {
    const res = await authedFetch("/api/voting")
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setError(json.error || "Could not load voting events"); return }
    setEvents(json.events || [])
    setIsAdmin(!!json.isAdmin)
    setCanManage(!!json.canManage)
  }

  useEffect(() => { load() }, [])

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

      {error && <div style={{ color: "var(--terracotta)", marginBottom: "1rem" }}>{error}</div>}

      {showCreate && <CreateEventForm onCreated={() => { setShowCreate(false); load() }} />}

      {events === null && <div style={{ color: "var(--text-dim)" }}>Loading…</div>}
      {events !== null && events.length === 0 && (
        <div style={{ color: "var(--text-dim)", padding: "2rem 0", textAlign: "center" }}>
          No votes have been run yet.
        </div>
      )}
      {(events || []).map(e => (
        <EventCard key={e.id} event={e} isAdmin={isAdmin} canManage={canManage} onChanged={load} />
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
      <button style={{ ...BTN_GHOST, marginBottom: "0.8rem" }} onClick={addChoice}>+ Add choice</button>

      <label style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Who can vote</label>
      <select style={{ ...INPUT, marginBottom: "0.6rem", appearance: "none", WebkitAppearance: "none" }} value={eligibilityMode} onChange={e => setEligibilityMode(e.target.value)}>
        <option value="per_resident">Every resident, one vote each</option>
        <option value="per_household">One vote per household</option>
      </select>

      <label style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>How many choices can a voter pick</label>
      <select style={{ ...INPUT, marginBottom: "0.6rem", appearance: "none", WebkitAppearance: "none" }} value={voteMode} onChange={e => setVoteMode(e.target.value)}>
        <option value="single">Exactly one</option>
        <option value="multi">More than one</option>
      </select>
      {voteMode === "multi" && (
        <>
          <label style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Maximum number of choices</label>
          <input type="number" min={1} style={{ ...INPUT, marginBottom: "0.6rem" }} value={maxSelections} onChange={e => setMaxSelections(e.target.value)} />
        </>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem", fontSize: "0.9rem" }}>
        <input type="checkbox" checked={allowSelfVote} onChange={e => setAllowSelfVote(e.target.checked)} />
        Allow candidates to vote for themselves
      </label>
      <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.6rem" }}>
        Only applies to Resident choices below — a resident can't be blocked from voting for a plain text option.
      </div>

      <label style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Who can see the result</label>
      <select style={{ ...INPUT, marginBottom: "0.6rem", appearance: "none", WebkitAppearance: "none" }} value={visOutcome} onChange={e => setVisOutcome(e.target.value)}>
        <option value="residents">All residents</option>
        <option value="admin_only">Admins only</option>
      </select>

      <label style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Who can see how many people voted</label>
      <select style={{ ...INPUT, marginBottom: "0.8rem", appearance: "none", WebkitAppearance: "none" }} value={visTurnout} onChange={e => setVisTurnout(e.target.value)}>
        <option value="residents">All residents</option>
        <option value="admin_only">Admins only</option>
      </select>

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

function EventCard({ event, isAdmin, canManage, onChanged }) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState(null)
  const [closesAtInput, setClosesAtInput] = useState("")
  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")

  async function loadDetail() {
    const res = await authedFetch(`/api/voting/${event.id}`)
    const json = await res.json().catch(() => ({}))
    if (res.ok) setDetail(json)
  }

  useEffect(() => { if (expanded && !detail) loadDetail() }, [expanded, detail])

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
    setMsg("Your vote has been recorded.")
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

  function toggleChoice(id) {
    const mode = detail?.event?.vote_mode
    if (mode === "single") { setSelected([id]); return }
    setSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id])
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "1rem", marginBottom: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", flexWrap: "wrap", gap: "0.4rem" }}
        onClick={() => setExpanded(v => !v)}>
        <div style={{ fontWeight: 700 }}>{event.title}</div>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: STATUS_COLOUR[event.status], border: `1px solid ${STATUS_COLOUR[event.status]}`, borderRadius: "999px", padding: "0.15rem 0.6rem" }}>
          {STATUS_LABEL[event.status]}
        </span>
      </div>

      {expanded && detail && (
        <div style={{ marginTop: "0.75rem" }}>
          {detail.event.description && <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>{detail.event.description}</p>}

          {event.status === "draft" && canManage && (
            <div style={{ marginBottom: "0.6rem" }}>
              <label style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Closing date/time</label>
              <input type="datetime-local" style={{ ...INPUT, marginBottom: "0.5rem" }} value={closesAtInput} onChange={e => setClosesAtInput(e.target.value)} />
              <button style={BTN_PRIMARY} disabled={busy} onClick={setClosesAt}>Open this vote</button>
            </div>
          )}

          {event.status === "open" && !detail.myParticipation && detail.eligibility?.eligible && (
            <div style={{ marginBottom: "0.6rem" }}>
              {(detail.choices || []).map(c => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
                  <input
                    type={detail.event.vote_mode === "single" ? "radio" : "checkbox"}
                    name="voting-choice" checked={selected.includes(c.id)} onChange={() => toggleChoice(c.id)}
                  />
                  {c.label}
                </label>
              ))}
              <button style={{ ...BTN_PRIMARY, marginTop: "0.6rem" }} disabled={busy} onClick={castVote}>Cast my vote</button>
            </div>
          )}

          {event.status === "open" && detail.myParticipation && (
            <div style={{ color: "#16a34a", fontWeight: 600, marginBottom: "0.6rem" }}>✓ You've voted in this ballot.</div>
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

          {event.status === "closed" && canManage && (
            <PublishReview eventId={event.id} onPublish={doPublish} busy={busy} />
          )}

          {msg && <div style={{ fontSize: "0.85rem", color: msg.includes("recorded") ? "#16a34a" : "var(--terracotta)" }}>{msg}</div>}
        </div>
      )}
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
