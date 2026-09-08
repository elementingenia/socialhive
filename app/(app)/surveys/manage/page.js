"use client"
import { useEffect, useState } from "react"
import { useUser } from "@/lib/UserContext"
import ManageAreaScreen from "@/components/ManageAreaScreen"
import { authedFetch } from "@/lib/getAuthToken"

const INPUT = {
  width: "100%", padding: "0.7rem 0.9rem", borderRadius: "10px",
  border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
  fontSize: "0.92rem", boxSizing: "border-box", fontFamily: "inherit",
}
const BTN_PRIMARY = {
  background: "var(--surveys)", color: "#fff", border: "none", borderRadius: "10px",
  padding: "0.65rem 1.05rem", fontWeight: 700, fontSize: "0.88rem", cursor: "pointer",
}
const BTN_GHOST = {
  background: "transparent", color: "var(--surveys)", border: "1px solid var(--surveys)",
  borderRadius: "10px", padding: "0.55rem 0.95rem", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer",
}

const TYPE_LABEL = {
  single_choice: "Single choice", multi_choice: "Multiple choice",
  rating: "Rating (1-10)", yes_no: "Yes / No", free_text: "Free text",
}
const CHOICE_TYPES = new Set(["single_choice", "multi_choice"])

// Surveys hub's "Manage this area" screen -- the show/hide toggle (mirrors
// Voting's VotingEnabledToggle exactly, same admin-only rule) plus the
// Question Bank: create/edit/archive the reusable question pool that
// survey creation on /surveys draws from. No Page Texts editor here --
// same call Special Events made ("No need for Page text in Admin") --
// KISS per Iain's V1 instruction for this feature.
export default function SurveysManagePage() {
  return (
    <ManageAreaScreen contextType="hub" contextKey="surveys" backHref="/surveys"
      backLabel="Surveys" title="Manage Surveys" colour="var(--surveys)">
      <SurveysEnabledToggle />
      <QuestionBank />
    </ManageAreaScreen>
  )
}

function SurveysEnabledToggle() {
  const { isAdmin } = useUser()
  const [enabled, setEnabled] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/hub-settings").then(r => r.json()).then(json => setEnabled(!!json?.surveys?.enabled)).catch(() => setEnabled(false))
  }, [])

  if (!isAdmin) return null // Owners never see this control at all -- not just disabled

  async function toggle() {
    setError(""); setSaving(true)
    const next = !enabled
    const res = await authedFetch("/api/hub-settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hub_type: "surveys", enabled: next }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return setError(json.error || "Could not update")
    setEnabled(next)
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "1rem", marginBottom: "1rem" }}>
      <div style={{ fontWeight: 700, marginBottom: "0.4rem" }}>Show this Hub to residents</div>
      <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
        Surveys is occasional, not a routine tile — turn it off between surveys so it doesn't sit on Home unused.
      </p>
      {enabled === null ? (
        <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</div>
      ) : (
        <button onClick={toggle} disabled={saving} style={{
          background: enabled ? "var(--surveys)" : "transparent",
          color: enabled ? "#fff" : "var(--surveys)",
          border: "1px solid var(--surveys)", borderRadius: "10px",
          padding: "0.6rem 1.1rem", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer",
        }}>
          {enabled ? "Visible on Home — tap to hide" : "Hidden from Home — tap to show"}
        </button>
      )}
      {error && <div style={{ color: "var(--terracotta)", fontSize: "0.85rem", marginTop: "0.5rem" }}>{error}</div>}
    </div>
  )
}

function QuestionBank() {
  const [questions, setQuestions] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState("")
  const [showArchived, setShowArchived] = useState(false)

  async function load() {
    const res = await authedFetch("/api/survey-questions")
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setError(json.error || "Could not load the question bank"); return }
    setQuestions(json.questions || [])
  }
  useEffect(() => { load() }, [])

  const visible = (questions || []).filter(q => showArchived || !q.archived)

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <div style={{ fontWeight: 700 }}>Question Bank</div>
        <button style={BTN_GHOST} onClick={() => setShowAdd(v => !v)}>{showAdd ? "Cancel" : "+ Add question"}</button>
      </div>
      <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
        The reusable pool of questions any new survey is built from.
      </p>

      {error && <div style={{ color: "var(--terracotta)", fontSize: "0.85rem", marginBottom: "0.6rem" }}>{error}</div>}
      {showAdd && <QuestionForm onSaved={() => { setShowAdd(false); load() }} onCancel={() => setShowAdd(false)} />}

      {questions === null && <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</div>}
      {questions !== null && visible.length === 0 && (
        <div style={{ color: "var(--text-dim)", fontSize: "0.85rem", padding: "0.5rem 0" }}>No questions yet — add the first one above.</div>
      )}
      {visible.map(q => <QuestionRow key={q.id} question={q} onChanged={load} />)}

      {questions !== null && questions.some(q => q.archived) && (
        <button onClick={() => setShowArchived(v => !v)} style={{ ...BTN_GHOST, marginTop: "0.6rem", fontSize: "0.75rem", padding: "0.35rem 0.7rem" }}>
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
      )}
    </div>
  )
}

function QuestionForm({ question, onSaved, onCancel }) {
  const editingLocked = !!question && question.inUse // server also enforces this -- see route's PATCH comment
  const [type, setType] = useState(question?.type || "single_choice")
  const [prompt, setPrompt] = useState(question?.prompt || "")
  const [helperText, setHelperText] = useState(question?.helper_text || "")
  const [choices, setChoices] = useState(
    question?.choices?.length ? question.choices.map(c => c.label) : ["", ""]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  function setChoice(i, val) { setChoices(cs => cs.map((c, idx) => idx === i ? val : c)) }
  function addChoice() { setChoices(cs => [...cs, ""]) }
  function removeChoice(i) { setChoices(cs => cs.filter((_, idx) => idx !== i)) }

  async function save() {
    setError("")
    if (!prompt.trim()) return setError("A prompt is required")
    const cleanChoices = choices.map(c => c.trim()).filter(Boolean)
    if (CHOICE_TYPES.has(type) && cleanChoices.length < 2) {
      return setError("At least two choices are required for this question type")
    }
    setSaving(true)
    const body = editingLocked
      ? { helper_text: helperText.trim() || null }
      : { type, prompt: prompt.trim(), helper_text: helperText.trim() || null, choices: CHOICE_TYPES.has(type) ? cleanChoices.map(label => ({ label })) : undefined }
    const url = question ? `/api/survey-questions/${question.id}` : "/api/survey-questions"
    const res = await authedFetch(url, {
      method: question ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return setError(json.error || "Could not save this question")
    onSaved()
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "0.8rem", marginBottom: "0.75rem" }}>
      {editingLocked && (
        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", fontStyle: "italic", marginBottom: "0.6rem" }}>
          This question is already attached to a survey — only its helper text can change. Archive it and add a new question to change the type, prompt, or choices.
        </div>
      )}

      {!editingLocked && (
        <>
          <label style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>Type</label>
          <select value={type} onChange={e => setType(e.target.value)} style={{ ...INPUT, marginBottom: "0.55rem" }}>
            {Object.entries(TYPE_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>

          <label style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>Prompt</label>
          <input style={{ ...INPUT, marginBottom: "0.55rem" }} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="e.g. How satisfied are you with the new BBQ area?" />
        </>
      )}

      {!editingLocked && CHOICE_TYPES.has(type) && (
        <>
          <label style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>Choices</label>
          {choices.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem" }}>
              <input style={INPUT} value={c} onChange={e => setChoice(i, e.target.value)} placeholder={`Choice ${i + 1}`} />
              {choices.length > 2 && <button type="button" style={{ ...BTN_GHOST, padding: "0.4rem 0.6rem" }} onClick={() => removeChoice(i)}>✕</button>}
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.55rem" }}>
            <button type="button" style={BTN_GHOST} onClick={addChoice}>+ Add choice</button>
          </div>
        </>
      )}

      <label style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>Helper text (optional)</label>
      <input style={{ ...INPUT, marginBottom: "0.6rem" }} value={helperText} onChange={e => setHelperText(e.target.value)} placeholder="A short hint shown under the question" />

      {error && <div style={{ color: "var(--terracotta)", fontSize: "0.82rem", marginBottom: "0.5rem" }}>{error}</div>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button style={BTN_PRIMARY} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
        {onCancel && <button style={BTN_GHOST} onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  )
}

function QuestionRow({ question, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  async function toggleArchive() {
    setBusy(true)
    const res = await authedFetch(`/api/survey-questions/${question.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !question.archived }),
    })
    setBusy(false)
    if (res.ok) onChanged()
  }

  if (editing) {
    return <QuestionForm question={question} onSaved={() => { setEditing(false); onChanged() }} onCancel={() => setEditing(false)} />
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.6rem", padding: "0.6rem 0", borderBottom: "1px solid var(--border)", opacity: question.archived ? 0.55 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{question.prompt}</div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
          {TYPE_LABEL[question.type]}{question.archived ? " · Archived" : ""}
        </div>
        {question.choices?.length > 0 && (
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.15rem" }}>
            {question.choices.map(c => c.label).join(", ")}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
        <button style={{ ...BTN_GHOST, padding: "0.35rem 0.6rem", fontSize: "0.75rem" }} onClick={() => setEditing(true)}>Edit</button>
        <button style={{ ...BTN_GHOST, padding: "0.35rem 0.6rem", fontSize: "0.75rem" }} disabled={busy} onClick={toggleArchive}>
          {question.archived ? "Unarchive" : "Archive"}
        </button>
      </div>
    </div>
  )
}
