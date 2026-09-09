"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { authedFetch } from "@/lib/getAuthToken"
import { supabase } from "@/lib/supabase"
import { SurveysIcon } from "@/components/NavIcons"
import ExpandableText from "@/components/ExpandableText"
import { sydneyTodayStr } from "@/lib/date"

const INPUT = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: "10px",
  border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
  fontSize: "0.95rem", boxSizing: "border-box", fontFamily: "inherit",
}
const BTN_PRIMARY = {
  background: "var(--surveys)", color: "#fff", border: "none", borderRadius: "10px",
  padding: "0.7rem 1.1rem", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", width: "100%",
}
const BTN_GHOST = {
  background: "transparent", color: "var(--surveys)", border: "1px solid var(--surveys)",
  borderRadius: "10px", padding: "0.6rem 1rem", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer",
}
const ALL_HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))

function typeBtnStyle(active) {
  return {
    flex: 1, padding: "0.45rem 0.6rem", borderRadius: "8px", fontWeight: 600, fontSize: "0.8rem",
    border: `1px solid ${active ? "var(--surveys)" : "var(--border)"}`,
    background: active ? "var(--surveys)" : "var(--surface)",
    color: active ? "#fff" : "var(--text)", cursor: "pointer", fontFamily: "inherit",
  }
}

function fmtClosesAt(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const datePart = d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
  const hour = d.getHours()
  const timePart = hour === 0 ? "12am" : hour < 12 ? `${hour}am` : hour === 12 ? "12pm" : `${hour - 12}pm`
  return `${datePart}, ${timePart}`
}

// Same date+hour-only closing-time control as Voting's ClosingDateTimeField
// (app/(app)/voting/page.js) -- kept local rather than shared since each
// hub's earlier copy of this exact pattern (Voting's own) has already
// drifted (colour token) and a shared component would need to take that as
// a prop for no real benefit at this size.
function ClosingDateTimeField({ value, onChange }) {
  const [datePart, timePart] = value ? value.split("T") : ["", ""]
  const hourPart = timePart ? timePart.slice(0, 2) : ""
  function setDate(d) { onChange(d ? `${d}T${hourPart || "12"}:00` : "") }
  function setHour(h) { if (!h) return; onChange(`${datePart || sydneyTodayStr()}T${h}:00`) }
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

const STATUS_LABEL = { draft: "Draft", open: "Open", closed: "Closed", published: "Published" }
const STATUS_COLOUR = { draft: "var(--text-dim)", open: "#16a34a", closed: "var(--amber-dark)", published: "var(--surveys)" }
const TYPE_LABEL = {
  single_choice: "Single choice", multi_choice: "Multiple choice",
  rating: "Rating (1-10)", yes_no: "Yes / No", free_text: "Free text",
}

export default function SurveysHubPage() {
  const router = useRouter()
  const [surveys, setSurveys] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [canManage, setCanManage] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState("")

  async function load() {
    const res = await authedFetch("/api/surveys")
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setError(json.error || "Could not load surveys"); return }
    setSurveys(json.surveys || [])
    setIsAdmin(!!json.isAdmin)
    setCanManage(!!json.canManage)
  }
  useEffect(() => { load() }, [])

  return (
    <div style={{ padding: "1rem", maxWidth: "640px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
        <span style={{ color: "var(--surveys)", lineHeight: 0 }}><SurveysIcon size={32} /></span>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0 }}>Surveys</h1>
      </div>

      {canManage && (
        <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem" }}>
          <button style={BTN_PRIMARY} onClick={() => setShowCreate(v => !v)}>
            {showCreate ? "Cancel" : "+ New Survey"}
          </button>
          {isAdmin && <button style={BTN_GHOST} onClick={() => router.push("/surveys/manage")}>Manage</button>}
        </div>
      )}

      {error && <div style={{ color: "var(--terracotta)", marginBottom: "1rem" }}>{error}</div>}

      {showCreate && <CreateSurveyForm onCreated={() => { setShowCreate(false); load() }} />}

      {surveys === null && <div style={{ color: "var(--text-dim)" }}>Loading…</div>}
      {surveys !== null && surveys.length === 0 && (
        <div style={{ color: "var(--text-dim)", padding: "2rem 0", textAlign: "center" }}>
          No surveys have been run yet.
        </div>
      )}
      {(surveys || []).map(s => (
        <SurveyCard key={s.id} survey={s} isAdmin={isAdmin} canManage={canManage} canManageEvent={s.canManageEvent} onChanged={load} />
      ))}
    </div>
  )
}

// Shared by CreateSurveyForm (new survey) and DraftQuestionsEditor (editing
// an existing Draft's question set) -- the bank checklist to pick which
// questions are attached, plus the ordered list that actually carries the
// numbering shown to respondents (Iain: "Question numbering... with a
// reorder UI so numbers can change after initial sequential entry — numbers
// shown to survey respondents too"). Order IS array position -- no separate
// sort_order input, the up/down buttons below are the only way to reorder,
// same "position in the array is the truth" pattern PATCH /api/surveys/[id]
// already expects (it writes sort_order from each item's index).
function SurveyItemsEditor({ bank, selectedItems, setSelectedItems }) {
  function toggleItem(question_id) {
    setSelectedItems(items => {
      const exists = items.find(i => i.question_id === question_id)
      if (exists) return items.filter(i => i.question_id !== question_id)
      return [...items, { question_id, required: false, allow_comment: false }]
    })
  }
  function setItemRequired(question_id, required) {
    setSelectedItems(items => items.map(i => i.question_id === question_id ? { ...i, required } : i))
  }
  function setItemComment(question_id, allow_comment) {
    setSelectedItems(items => items.map(i => i.question_id === question_id ? { ...i, allow_comment } : i))
  }
  function moveItem(question_id, dir) {
    setSelectedItems(items => {
      const idx = items.findIndex(i => i.question_id === question_id)
      const swapIdx = idx + dir
      if (idx < 0 || swapIdx < 0 || swapIdx >= items.length) return items
      const copy = [...items]
      ;[copy[idx], copy[swapIdx]] = [copy[swapIdx], copy[idx]]
      return copy
    })
  }
  const bankById = Object.fromEntries((bank || []).map(q => [q.id, q]))

  return (
    <>
      <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: "0.3rem" }}>Questions</label>
      {bank === null && <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading question bank…</div>}
      {bank !== null && bank.length === 0 && (
        <div style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginBottom: "0.6rem" }}>
          The question bank is empty — add questions from the Manage screen first.
        </div>
      )}
      {(bank || []).map(q => {
        const picked = selectedItems.find(i => i.question_id === q.id)
        return (
          <label key={q.id} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", cursor: "pointer", border: "1px solid var(--border)", borderRadius: "10px", padding: "0.6rem", marginBottom: "0.4rem" }}>
            <input type="checkbox" checked={!!picked} onChange={() => toggleItem(q.id)} style={{ marginTop: "0.2rem" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{q.prompt}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{TYPE_LABEL[q.type]}</div>
            </div>
          </label>
        )
      })}

      {selectedItems.length > 0 && (
        <div style={{ marginTop: "0.7rem" }}>
          <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: "0.3rem" }}>
            Order — this is the number shown to respondents
          </label>
          {selectedItems.map((item, i) => {
            const q = bankById[item.question_id]
            if (!q) return null
            return (
              <div key={item.question_id} style={{ border: "1px solid var(--border)", borderRadius: "10px", padding: "0.6rem", marginBottom: "0.4rem" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                  <div style={{ fontWeight: 800, color: "var(--surveys)", minWidth: "1.4rem" }}>{i + 1}.</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{q.prompt}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{TYPE_LABEL[q.type]}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                    <button type="button" disabled={i === 0} onClick={() => moveItem(item.question_id, -1)}
                      style={{ ...BTN_GHOST, padding: "0.15rem 0.5rem", fontSize: "0.75rem", opacity: i === 0 ? 0.4 : 1 }}>▲</button>
                    <button type="button" disabled={i === selectedItems.length - 1} onClick={() => moveItem(item.question_id, 1)}
                      style={{ ...BTN_GHOST, padding: "0.15rem 0.5rem", fontSize: "0.75rem", opacity: i === selectedItems.length - 1 ? 0.4 : 1 }}>▼</button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "1rem", marginTop: "0.4rem", marginLeft: "1.9rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem" }}>
                    <input type="checkbox" checked={item.required} onChange={e => setItemRequired(item.question_id, e.target.checked)} />
                    Required
                  </label>
                  {q.type !== "free_text" && (
                    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem" }}>
                      <input type="checkbox" checked={item.allow_comment} onChange={e => setItemComment(item.question_id, e.target.checked)} />
                      Allow a comment
                    </label>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function CreateSurveyForm({ onCreated }) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [eligibilityMode, setEligibilityMode] = useState("per_resident")
  const [anonymous, setAnonymous] = useState(false)
  const [visOutcome, setVisOutcome] = useState("residents")
  const [visTurnout, setVisTurnout] = useState("residents")
  const [coordinators, setCoordinators] = useState([]) // [{id, name}, ...] -- any number, no primary (104_survey_coordinators.sql)
  const [members, setMembers] = useState([])
  const [bank, setBank] = useState(null)
  const [selectedItems, setSelectedItems] = useState([]) // [{ question_id, required, allow_comment }], array order = respondent-facing numbering
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    supabase.from("members").select("id, name").order("name").then(({ data }) => setMembers(data || []))
    authedFetch("/api/survey-questions").then(r => r.json()).then(json => setBank((json.questions || []).filter(q => !q.archived))).catch(() => setBank([]))
  }, [])

  async function save() {
    setError("")
    if (!title.trim()) return setError("Title is required")
    if (coordinators.length === 0) return setError("At least one coordinator is required")
    if (selectedItems.length === 0) return setError("Pick at least one question from the bank")
    setSaving(true)
    const res = await authedFetch("/api/surveys", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || null,
        eligibility_mode: eligibilityMode,
        anonymous,
        results_visibility_outcome: visOutcome,
        results_visibility_turnout: visTurnout,
        coordinator_ids: coordinators.map(m => m.id),
        items: selectedItems,
      }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return setError(json.error || "Could not create survey")
    onCreated()
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "1rem", marginBottom: "1rem" }}>
      <div style={{ fontWeight: 700, marginBottom: "0.75rem" }}>New Survey</div>

      <label style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Title</label>
      <input style={{ ...INPUT, marginBottom: "0.6rem" }} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. BBQ Area Feedback" />

      <label style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Description (optional)</label>
      <textarea style={{ ...INPUT, marginBottom: "0.9rem", minHeight: "70px" }} value={description} onChange={e => setDescription(e.target.value)} />

      <div style={{ marginBottom: "0.9rem" }}>
        <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: "0.3rem" }}>Who can respond</label>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button type="button" style={typeBtnStyle(eligibilityMode === "per_resident")} onClick={() => setEligibilityMode("per_resident")}>One response per Resident</button>
          <button type="button" style={typeBtnStyle(eligibilityMode === "per_household")} onClick={() => setEligibilityMode("per_household")}>One response per Household</button>
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem", fontSize: "0.9rem" }}>
        <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} />
        Anonymous responses
      </label>
      <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.8rem" }}>
        Hides who responded from EVERYONE, including the assigned coordinator — only an anonymised summary is ever visible. Leave this off if the coordinator should be able to see who responded, e.g. to follow up directly.
      </div>

      <div style={{ marginBottom: "0.9rem" }}>
        <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: "0.3rem" }}>Who can see the results</label>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button type="button" style={typeBtnStyle(visOutcome === "residents")} onClick={() => setVisOutcome("residents")}>All residents</button>
          <button type="button" style={typeBtnStyle(visOutcome === "admin_only")} onClick={() => setVisOutcome("admin_only")}>Coordinator only</button>
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.3rem" }}>
          Either way, an Admin or Owner who isn't the coordinator never sees results — only the coordinator and (if you choose "All residents") ordinary residents, as an anonymised summary.
        </div>
      </div>

      <div style={{ marginBottom: "0.8rem" }}>
        <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: "0.3rem" }}>Who can see how many people responded</label>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button type="button" style={typeBtnStyle(visTurnout === "residents")} onClick={() => setVisTurnout("residents")}>All residents</button>
          <button type="button" style={typeBtnStyle(visTurnout === "admin_only")} onClick={() => setVisTurnout("admin_only")}>Coordinator only</button>
        </div>
      </div>

      <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: "0.3rem" }}>Coordinators</label>
      <div style={{ marginBottom: "0.9rem" }}>
        <CoordinatorsPicker members={members} value={coordinators} onChange={setCoordinators} />
      </div>

      <SurveyItemsEditor bank={bank} selectedItems={selectedItems} setSelectedItems={setSelectedItems} />

      {error && <div style={{ color: "var(--terracotta)", margin: "0.6rem 0", fontSize: "0.85rem" }}>{error}</div>}
      <button style={{ ...BTN_PRIMARY, marginTop: "0.6rem" }} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save as Draft"}</button>
    </div>
  )
}

// Multi-select coordinator picker -- chips + add-another dropdown, exact
// same pattern as every event-based hub's EC picker (e.g.
// app/(app)/social/events/page.js's ECPicker), just this hub's colour token.
// Replaces the old single-select CoordPicker per Iain (2026-09-09, "Need to
// be able to add more than one coordinator" -> "follow same pattern as
// other hubs / Groups and clubs"): any number of coordinators, all with
// identical permissions, no "primary".
function CoordinatorsPicker({ members = [], value, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const containerRef = useRef(null)

  useEffect(() => {
    function handler(e) { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const excluded = value.map(m => m.id)
  const pool = members.filter(m => !excluded.includes(m.id))
  const filtered = pool.filter(m => !query || (m.name || "").toLowerCase().includes(query.toLowerCase()))

  function pick(m) { onChange([...value, m]); setOpen(false); setQuery("") }
  function remove(id) { onChange(value.filter(m => m.id !== id)) }

  return (
    <div ref={containerRef}>
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem" }}>
          {value.map(m => (
            <span key={m.id} style={{
              display: "inline-flex", alignItems: "center", gap: "0.3rem",
              background: "rgba(8,145,178,0.12)", color: "var(--surveys)",
              border: "1px solid rgba(8,145,178,0.4)",
              borderRadius: "20px", padding: "0.2rem 0.6rem 0.2rem 0.75rem",
              fontSize: "0.82rem", fontWeight: 600,
            }}>
              {m.name}
              <button type="button" onClick={() => remove(m.id)}
                style={{ background: "none", border: "none", color: "var(--surveys)", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}

      <div style={{ position: "relative" }}>
        <div onClick={() => { setOpen(o => !o); setQuery("") }}
          role="button" tabIndex={0} aria-haspopup="listbox" aria-expanded={open}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(o => !o); setQuery("") } }}
          style={{ ...INPUT, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", border: `1.5px solid ${open ? "var(--surveys)" : "var(--border)"}` }}>
          <span style={{ color: "var(--text-dim)" }}>{value.length === 0 ? "Select coordinator…" : "Add another coordinator…"}</span>
          <span style={{ color: "var(--text-dim)", fontSize: "0.75rem", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
        </div>

        {open && (
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 60, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden" }}>
            <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name…"
                style={{ width: "100%", border: "none", background: "transparent", color: "var(--text)", fontSize: "0.9rem", outline: "none", fontFamily: "inherit" }} />
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {filtered.map(m => (
                <div key={m.id} onClick={() => pick(m)} style={{ padding: "0.65rem 1rem", cursor: "pointer", borderBottom: "1px solid var(--border)", fontSize: "0.88rem", color: "var(--text)" }}>
                  {m.name}
                </div>
              ))}
              {filtered.length === 0 && query && (
                <div style={{ padding: "0.65rem 1rem", color: "var(--text-dim)", fontSize: "0.85rem" }}>No match for "{query}"</div>
              )}
              {filtered.length === 0 && !query && pool.length === 0 && members.length > 0 && (
                <div style={{ padding: "0.65rem 1rem", color: "var(--text-dim)", fontSize: "0.85rem" }}>All coordinators already added</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Edit a Draft survey's attached questions -- order, required, allow_comment
// -- after initial creation (Iain: numbers should be able to "change after
// initial sequential entry", not just be fixed at creation time). PATCH
// /api/surveys/[id] already accepted a full items replace while Draft;
// there was simply no UI for it before this. Collapsed by default so a
// Draft with nothing to change doesn't grow the card.
function DraftQuestionsEditor({ survey, detail, onSaved }) {
  const [open, setOpen] = useState(false)
  const [bank, setBank] = useState(null)
  const [selectedItems, setSelectedItems] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open || selectedItems !== null) return
    authedFetch("/api/survey-questions").then(r => r.json()).then(json => setBank((json.questions || []).filter(q => !q.archived)))
    setSelectedItems((detail.items || []).map(it => ({
      question_id: it.question.id, required: !!it.required, allow_comment: !!it.allow_comment,
    })))
  }, [open, selectedItems, detail.items])

  async function save() {
    setError("")
    if (!selectedItems || selectedItems.length === 0) return setError("Pick at least one question")
    setSaving(true)
    const res = await authedFetch(`/api/surveys/${survey.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: selectedItems }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return setError(json.error || "Could not save these changes")
    setOpen(false)
    onSaved()
  }

  if (!open) {
    return (
      <div style={{ marginBottom: "0.6rem" }}>
        <button style={{ ...BTN_GHOST, padding: "0.35rem 0.7rem", fontSize: "0.78rem" }} onClick={() => setOpen(true)}>Edit questions</button>
      </div>
    )
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "0.75rem", marginBottom: "0.6rem" }}>
      {(bank === null || selectedItems === null) ? (
        <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</div>
      ) : (
        <SurveyItemsEditor bank={bank} selectedItems={selectedItems} setSelectedItems={setSelectedItems} />
      )}
      {error && <div style={{ color: "var(--terracotta)", fontSize: "0.82rem", margin: "0.5rem 0" }}>{error}</div>}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <button style={{ ...BTN_PRIMARY, width: "auto", padding: "0.5rem 0.9rem" }} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save questions"}</button>
        <button style={{ ...BTN_GHOST, padding: "0.5rem 0.9rem" }} disabled={saving} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  )
}

// Edit an existing survey's coordinator set -- coordinator_ids is an
// "always editable, non-published" field (same tier as title/description/
// closes_at/visibility in PATCH /api/surveys/[id]), not locked to Draft the
// way items/eligibility/anonymity are, since changing WHO manages a survey
// doesn't invalidate anything already answered. Collapsed by default, same
// UX as DraftQuestionsEditor above.
function SurveyCoordinatorsEditor({ survey, detail, onSaved }) {
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState([])
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open || selected !== null) return
    supabase.from("members").select("id, name").order("name").then(({ data }) => setMembers(data || []))
    setSelected((detail.coordinatorIds || []).map((id, i) => ({ id, name: detail.coordinatorNames?.[i] })))
  }, [open, selected, detail.coordinatorIds, detail.coordinatorNames])

  async function save() {
    setError("")
    if (!selected || selected.length === 0) return setError("At least one coordinator is required")
    setSaving(true)
    const res = await authedFetch(`/api/surveys/${survey.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coordinator_ids: selected.map(m => m.id) }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return setError(json.error || "Could not save these changes")
    setOpen(false)
    onSaved()
  }

  if (!open) {
    return (
      <div style={{ marginBottom: "0.6rem" }}>
        <button style={{ ...BTN_GHOST, padding: "0.35rem 0.7rem", fontSize: "0.78rem" }} onClick={() => setOpen(true)}>Edit coordinators</button>
      </div>
    )
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "0.75rem", marginBottom: "0.6rem" }}>
      {selected === null ? (
        <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</div>
      ) : (
        <CoordinatorsPicker members={members} value={selected} onChange={setSelected} />
      )}
      {error && <div style={{ color: "var(--terracotta)", fontSize: "0.82rem", margin: "0.5rem 0" }}>{error}</div>}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <button style={{ ...BTN_PRIMARY, width: "auto", padding: "0.5rem 0.9rem" }} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save coordinators"}</button>
        <button style={{ ...BTN_GHOST, padding: "0.5rem 0.9rem" }} disabled={saving} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  )
}

function SurveyCard({ survey, isAdmin, canManage, canManageEvent, onChanged }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [detail, setDetail] = useState(null)
  const [closesAtInput, setClosesAtInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")

  async function loadDetail() {
    const res = await authedFetch(`/api/surveys/${survey.id}`)
    const json = await res.json().catch(() => ({}))
    if (res.ok) setDetail(json)
  }
  useEffect(() => { if (expanded && !detail) loadDetail() }, [expanded, detail])

  const canManageThis = detail ? !!detail.canManageEvent : !!canManageEvent

  async function doOpen() {
    if (!closesAtInput) return setMsg("Set a closing date/time first")
    setMsg(""); setBusy(true)
    const res = await authedFetch(`/api/surveys/${survey.id}/open`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closes_at: new Date(closesAtInput).toISOString() }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setMsg(json.error || "Could not open this survey")
    onChanged(); loadDetail()
  }

  async function doClose() {
    setMsg(""); setBusy(true)
    const res = await authedFetch(`/api/surveys/${survey.id}/close`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
    const json = await res.json().catch(() => ({}))
    setBusy(false); setConfirmClose(false)
    if (!res.ok) return setMsg(json.error || "Could not close this survey")
    onChanged(); loadDetail()
  }

  async function doPublish() {
    setMsg(""); setBusy(true)
    const res = await authedFetch(`/api/surveys/${survey.id}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setMsg(json.error || "Could not publish results")
    onChanged(); loadDetail()
  }

  async function doCancel() {
    setMsg(""); setBusy(true)
    const res = await authedFetch(`/api/surveys/${survey.id}`, { method: "DELETE" })
    const json = await res.json().catch(() => ({}))
    setBusy(false); setConfirmCancel(false)
    if (!res.ok) return setMsg(json.error || "Could not cancel this survey")
    onChanged()
  }

  const closesLabel = fmtClosesAt(survey.closes_at)
  const isClosedOrPublished = survey.status === "closed" || survey.status === "published"
  // Always offer the link once closed/published -- the results page itself
  // (GET /api/surveys/[id]/results) is the real, stricter gate (coordinator
  // gets full detail, a toggle-visible resident gets an anonymised
  // aggregate, everyone else gets a plain "not visible to you" message
  // rather than a dead link that may or may not work depending on a toggle
  // this card can't fully reason about client-side).
  const resultsReachable = isClosedOrPublished

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", overflow: "hidden", marginBottom: "0.75rem" }}>
      <div style={{ padding: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.4rem" }}>
          <div style={{ cursor: "pointer", flex: "1 1 auto", minWidth: 0 }} onClick={() => setExpanded(v => !v)}>
            <div style={{ fontWeight: 700, fontSize: "1rem", lineHeight: 1.2 }}>{survey.title}</div>
          </div>
          <span style={{ cursor: "pointer" }} onClick={() => setExpanded(v => !v)}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: STATUS_COLOUR[survey.status], border: `1px solid ${STATUS_COLOUR[survey.status]}`, borderRadius: "999px", padding: "0.15rem 0.6rem" }}>
              {STATUS_LABEL[survey.status]}
            </span>
          </span>
        </div>

        {survey.coordinatorNames?.length > 0 && (
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: "0.2rem" }}>
            Coordinator{survey.coordinatorNames.length > 1 ? "s" : ""}: <span style={{ fontWeight: 600, color: "var(--surveys)" }}>{survey.coordinatorNames.join(", ")}</span>
          </div>
        )}

        {survey.description && (
          <div style={{ marginTop: "0.3rem", marginBottom: "0.2rem" }}>
            <ExpandableText text={survey.description} fontSize={13} lineHeight={1.5} maxLines={2} colour="var(--surveys)" />
          </div>
        )}

        {(survey.responsesCount !== null || closesLabel) && (
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: "0.15rem" }}>
            {survey.responsesCount !== null && <div>{survey.responsesCount} response{survey.responsesCount === 1 ? "" : "s"}</div>}
            {closesLabel && <div>{isClosedOrPublished ? `Closed ${closesLabel}` : `Closes ${closesLabel}`}</div>}
          </div>
        )}

        {resultsReachable && (
          <div style={{ marginTop: "0.5rem" }}>
            <button style={{ ...BTN_GHOST, padding: "0.35rem 0.7rem", fontSize: "0.78rem" }} onClick={() => router.push(`/surveys/${survey.id}/results`)}>
              View results
            </button>
          </div>
        )}

        {msg && <div style={{ color: "var(--terracotta)", fontSize: "0.85rem", marginTop: "0.5rem" }}>{msg}</div>}

        {expanded && detail && (
          <div style={{ marginTop: "0.75rem" }}>
            {survey.status !== "published" && canManageThis && (
              <SurveyCoordinatorsEditor survey={survey} detail={detail} onSaved={() => { onChanged(); loadDetail() }} />
            )}

            {survey.status === "draft" && canManageThis && (
              <DraftQuestionsEditor survey={survey} detail={detail} onSaved={() => { onChanged(); loadDetail() }} />
            )}

            {survey.status === "draft" && canManageThis && (
              <div style={{ marginBottom: "0.6rem" }}>
                <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: "0.3rem" }}>Closing date/time</label>
                <div style={{ marginBottom: "0.5rem" }}>
                  <ClosingDateTimeField value={closesAtInput} onChange={setClosesAtInput} />
                </div>
                <button style={BTN_PRIMARY} disabled={busy} onClick={doOpen}>Open this survey</button>
              </div>
            )}

            {canManageThis && (survey.status === "draft" || (survey.status === "open" && (survey.responsesCount === 0 || survey.responsesCount == null))) && (
              <div style={{ marginBottom: "0.6rem" }}>
                {!confirmCancel ? (
                  <button style={{ ...BTN_GHOST, color: "var(--terracotta)", borderColor: "var(--terracotta)" }} disabled={busy} onClick={() => setConfirmCancel(true)}>
                    {survey.status === "draft" ? "Cancel this survey" : "Cancel this survey (abandon)"}
                  </button>
                ) : (
                  <div style={{ background: "var(--amber-light)", borderLeft: "3px solid var(--amber)", borderRadius: "8px", padding: "0.6rem", fontSize: "0.85rem" }}>
                    <div style={{ marginBottom: "0.5rem" }}>
                      {survey.status === "draft" ? "Cancel this survey? It will be removed and this can't be undone." : "Abandon this survey before anyone has responded? It will be removed and this can't be undone."}
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button style={{ ...BTN_PRIMARY, background: "var(--terracotta)", width: "auto", padding: "0.5rem 0.9rem" }} disabled={busy} onClick={doCancel}>Yes, cancel it</button>
                      <button style={{ ...BTN_GHOST, padding: "0.5rem 0.9rem" }} disabled={busy} onClick={() => setConfirmCancel(false)}>Never mind</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {survey.status === "open" && canManageThis && (
              <div style={{ marginBottom: "0.6rem" }}>
                {!confirmClose ? (
                  <button style={{ ...BTN_GHOST, padding: "0.35rem 0.7rem", fontSize: "0.78rem" }} disabled={busy} onClick={() => setConfirmClose(true)}>Close this survey now</button>
                ) : (
                  <div style={{ background: "var(--amber-light)", borderLeft: "3px solid var(--amber)", borderRadius: "8px", padding: "0.5rem", fontSize: "0.78rem" }}>
                    <div style={{ marginBottom: "0.4rem" }}>Close this survey now, ahead of its scheduled closing time?</div>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <button style={{ ...BTN_PRIMARY, background: "var(--terracotta)", width: "auto", padding: "0.35rem 0.7rem", fontSize: "0.75rem" }} disabled={busy} onClick={doClose}>Yes, close it</button>
                      <button style={{ ...BTN_GHOST, padding: "0.35rem 0.7rem", fontSize: "0.75rem" }} disabled={busy} onClick={() => setConfirmClose(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {survey.status === "closed" && canManageThis && (
              <button style={BTN_PRIMARY} disabled={busy} onClick={doPublish}>Publish results</button>
            )}

            {survey.status === "open" && (
              <SurveyRespondSection survey={survey} detail={detail} onSubmitted={() => { onChanged(); loadDetail() }} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// The respond form -- one field per attached item, matching its
// question.type. Loads any existing draft via GET /respond (resume) and
// saves via POST /respond, either as a draft (submit:false, no completeness
// check) or a final submission (submit:true, required items enforced
// server-side too). Only rendered while the survey is Open and the viewer
// hasn't already submitted.
function SurveyRespondSection({ survey, detail, onSubmitted }) {
  const [loaded, setLoaded] = useState(false)
  const [response, setResponse] = useState(null)
  const [answers, setAnswers] = useState({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")
  const [savedAt, setSavedAt] = useState(null)

  useEffect(() => {
    authedFetch(`/api/surveys/${survey.id}/respond`).then(r => r.json()).then(json => {
      setResponse(json.response || null)
      setAnswers(json.answers || {})
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [survey.id])

  function setAnswer(question_id, patch) {
    setAnswers(a => ({ ...a, [question_id]: { ...(a[question_id] || {}), ...patch } }))
  }

  async function submit(doSubmit) {
    setMsg(""); setSaving(true)
    const res = await authedFetch(`/api/surveys/${survey.id}/respond`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers, submit: doSubmit }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return setMsg(json.error || "Could not save your response")
    if (doSubmit) { onSubmitted(); return }
    setSavedAt(new Date())
    setResponse(r => r || { submittedAt: null })
  }

  if (!loaded) return <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</div>

  if (response?.submittedAt) {
    return <div style={{ color: "#16a34a", fontWeight: 600, marginBottom: "0.4rem" }}>✓ You've responded to this survey.</div>
  }

  if (!detail.eligibility?.eligible) {
    return <div style={{ color: "var(--terracotta)", fontSize: "0.85rem" }}>{detail.eligibility.reason}</div>
  }

  const items = detail.items || []

  return (
    <div>
      {response && !response.submittedAt && (
        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.6rem", fontStyle: "italic" }}>
          You have a response in progress — pick up where you left off below.
        </div>
      )}
      {items.map((item, i) => (
        <QuestionField key={item.id} number={i + 1} item={item} answer={answers[item.question_id]} onChange={patch => setAnswer(item.question_id, patch)} />
      ))}
      {msg && <div style={{ color: "var(--terracotta)", fontSize: "0.85rem", margin: "0.5rem 0" }}>{msg}</div>}
      {savedAt && !msg && <div style={{ color: "#16a34a", fontSize: "0.8rem", margin: "0.4rem 0" }}>Saved — come back any time before the survey closes to finish.</div>}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
        <button style={{ ...BTN_GHOST, flex: 1 }} disabled={saving} onClick={() => submit(false)}>Save for later</button>
        <button style={{ ...BTN_PRIMARY, flex: 1 }} disabled={saving} onClick={() => submit(true)}>Submit</button>
      </div>
    </div>
  )
}

function QuestionField({ number, item, answer, onChange }) {
  const q = item.question
  return (
    <div style={{ marginBottom: "0.9rem" }}>
      <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.15rem" }}>
        {number != null && <span style={{ color: "var(--surveys)" }}>{number}. </span>}
        {q.prompt}{item.required && <span style={{ color: "var(--terracotta)" }}> *</span>}
      </div>
      {q.helper_text && <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.4rem" }}>{q.helper_text}</div>}

      {q.type === "single_choice" && (q.choices || []).map(c => (
        <label key={c.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.35rem 0" }}>
          <input type="radio" name={`q-${q.id}`} checked={answer?.choice_id === c.id} onChange={() => onChange({ choice_id: c.id })} />
          {c.label}
        </label>
      ))}

      {q.type === "multi_choice" && (q.choices || []).map(c => {
        const ids = answer?.choice_ids || []
        return (
          <label key={c.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.35rem 0" }}>
            <input type="checkbox" checked={ids.includes(c.id)}
              onChange={() => onChange({ choice_ids: ids.includes(c.id) ? ids.filter(x => x !== c.id) : [...ids, c.id] })} />
            {c.label}
          </label>
        )
      })}

      {q.type === "rating" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
            <button key={n} type="button" onClick={() => onChange({ rating_value: n })}
              style={{
                width: 34, height: 34, borderRadius: "8px", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
                border: `1px solid ${answer?.rating_value === n ? "var(--surveys)" : "var(--border)"}`,
                background: answer?.rating_value === n ? "var(--surveys)" : "var(--surface)",
                color: answer?.rating_value === n ? "#fff" : "var(--text)",
              }}>
              {n}
            </button>
          ))}
        </div>
      )}

      {q.type === "yes_no" && (
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" style={typeBtnStyle(answer?.yes_no === true)} onClick={() => onChange({ yes_no: true })}>Yes</button>
          <button type="button" style={typeBtnStyle(answer?.yes_no === false)} onClick={() => onChange({ yes_no: false })}>No</button>
        </div>
      )}

      {q.type === "free_text" && (
        <textarea style={{ ...INPUT, minHeight: "70px" }} value={answer?.free_text || ""} onChange={e => onChange({ free_text: e.target.value })} />
      )}

      {item.allow_comment && q.type !== "free_text" && (
        <div style={{ marginTop: "0.5rem" }}>
          <label style={{ fontSize: "0.75rem", color: "var(--text-dim)", display: "block", marginBottom: "0.2rem" }}>Comment (optional)</label>
          <textarea style={{ ...INPUT, minHeight: "50px" }} value={answer?.comment || ""} onChange={e => onChange({ comment: e.target.value })} placeholder="Add any context…" />
        </div>
      )}
    </div>
  )
}
