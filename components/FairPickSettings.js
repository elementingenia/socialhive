"use client"
import { useEffect, useMemo, useState } from "react"
import { authedFetch } from "@/lib/getAuthToken"
import { FAIR_PICK_LIMITS, FIELD_LABELS, MAX_BUCKETS, MAX_BUCKET_FROM, bucketSummary, sortBuckets, validateFairPickConfig } from "@/lib/fairPick"
import { isoToSydneyDateStr } from "@/lib/date"

// Admin > Hub Settings > Show Time > Pick a Film settings (Iain, 2026-10-27).
// Every number behind the Fair Pick ranking, editable here. Attendance
// weighting is a list of buckets that can be added, removed and edited.
// Rules and limits: lib/fairPick.js. Saves through
// /api/showtime/fair-pick/settings (admins only).

const inputStyle = {
  width: "100%", padding: "0.6rem 0.75rem", borderRadius: 10, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box", fontFamily: "inherit",
}
const smallBtn = {
  background: "none", border: "none", padding: 0, color: "var(--teal)", fontWeight: 600,
  fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit",
}

const HELP = {
  attendanceDays: "How far back to count film screenings a voter has attended.",
  recentShownDays: "Films shown within this many days are left out of Pick a Film. 0 leaves none out.",
  minRankedVotes: "Films with fewer votes go under Needs more votes, unranked.",
  maxVoterSharePct: "No one voter can carry more than this share of a film's score.",
  downCap: "How far one low score can pull a film down. Lower = harder to veto a film.",
  upCap: "How far one high score can lift a film.",
  minSpread: "Stops a voter who gives nearly the same score every time from swinging films. Higher = steadier.",
  strongScore: "Fair Pick score at or above this shows Strong pick.",
  goodScore: "At or above this shows Good pick; below it, Lukewarm.",
  splitSpread: "How divided voters must be for a film to show Split opinion. Lower = shown more often.",
}
const MAIN_KEYS = ["attendanceDays", "recentShownDays", "minRankedVotes", "maxVoterSharePct"]
const ADVANCED_KEYS = ["downCap", "upCap", "minSpread", "strongScore", "goodScore", "splitSpread"]

// Form state keeps strings so people can type freely; numbers on save.
const toForm = cfg => ({
  ...Object.fromEntries([...MAIN_KEYS, ...ADVANCED_KEYS].map(k => [k, String(cfg[k])])),
  attendanceBuckets: sortBuckets(cfg.attendanceBuckets).map(b => ({ from: String(b.from), weight: String(b.weight) })),
})
const fromForm = f => ({
  ...Object.fromEntries([...MAIN_KEYS, ...ADVANCED_KEYS].map(k => [k, f[k] === "" ? NaN : Number(f[k])])),
  attendanceBuckets: f.attendanceBuckets.map(b => ({ from: b.from === "" ? NaN : Number(b.from), weight: b.weight === "" ? NaN : Number(b.weight) })),
})

function NumberField({ k, value, onChange }) {
  const lim = FAIR_PICK_LIMITS[k]
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontWeight: 600, fontSize: "0.88rem", marginBottom: "0.2rem" }}>{FIELD_LABELS[k]}</div>
      <input value={value} onChange={e => onChange(e.target.value)} inputMode="decimal" style={inputStyle} />
      <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: "0.2rem" }}>
        {HELP[k]} ({lim.min}–{lim.max})
      </div>
    </label>
  )
}

export default function FairPickSettings({ colour = "var(--teal)" }) {
  const [loaded, setLoaded] = useState(null)   // { config, defaults, updatedAt, saved }
  const [form, setForm] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    authedFetch("/api/showtime/fair-pick/settings")
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) { setError(d.error || "Could not load the settings"); return }
        setLoaded(d); setForm(toForm(d.config))
      })
      .catch(() => setError("Could not load the settings"))
  }, [])

  const candidate = useMemo(() => form && fromForm(form), [form])
  const problem = useMemo(() => candidate && validateFairPickConfig(candidate), [candidate])
  const dirty = useMemo(() => loaded && form && JSON.stringify(toForm(loaded.config)) !== JSON.stringify(form), [loaded, form])

  if (error) return <div style={{ color: "var(--red, #c0392b)", fontSize: "0.88rem" }}>{error}</div>
  if (!form) return <div style={{ display: "flex", justifyContent: "center", padding: "1rem" }}><div className="spinner" /></div>

  const set = (k, v) => { setMessage(null); setForm(f => ({ ...f, [k]: v })) }
  const setBucket = (i, k, v) => { setMessage(null); setForm(f => ({ ...f, attendanceBuckets: f.attendanceBuckets.map((b, j) => j === i ? { ...b, [k]: v } : b) })) }
  const removeBucket = i => { setMessage(null); setForm(f => ({ ...f, attendanceBuckets: f.attendanceBuckets.filter((_, j) => j !== i) })) }
  const addBucket = () => {
    setMessage(null)
    setForm(f => {
      const nums = f.attendanceBuckets.map(b => Number(b.from)).filter(Number.isFinite)
      const next = Math.min(MAX_BUCKET_FROM, (nums.length ? Math.max(...nums) : -1) + 1)
      const lastW = Number(f.attendanceBuckets[f.attendanceBuckets.length - 1]?.weight)
      return { ...f, attendanceBuckets: [...f.attendanceBuckets, { from: String(next), weight: String(Number.isFinite(lastW) ? lastW : 100) }] }
    })
  }
  const tidyBuckets = () => {
    if (form.attendanceBuckets.some(b => b.from === "" || !Number.isFinite(Number(b.from)))) return
    setForm(f => ({ ...f, attendanceBuckets: [...f.attendanceBuckets].sort((a, b) => Number(a.from) - Number(b.from)) }))
  }

  async function save() {
    setSaving(true); setMessage(null)
    try {
      const r = await authedFetch("/api/showtime/fair-pick/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: candidate }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setMessage({ error: true, text: d.error || "Could not save" }); return }
      setLoaded(l => ({ ...l, config: d.config, saved: true, updatedAt: new Date().toISOString() }))
      setForm(toForm(d.config))
      setMessage({ text: "Saved. Pick a Film and Suggestions use the new settings straight away." })
    } catch {
      setMessage({ error: true, text: "Could not save" })
    } finally {
      setSaving(false)
    }
  }

  const bucketsValid = !candidate.attendanceBuckets.some(b => !Number.isFinite(b.from) || !Number.isFinite(b.weight))

  return (
    <div>
      <div style={{ fontWeight: 800, color: colour, marginBottom: "0.25rem" }}>Pick a Film settings</div>
      <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, marginBottom: "0.75rem" }}>
        The numbers behind the Pick a Film ranking (Show Time › Manage) and the Consider retiring flag on Suggestions.
        {loaded.saved && loaded.updatedAt
          ? ` Last saved ${isoToSydneyDateStr(loaded.updatedAt)}.`
          : " Using the starting settings."}
      </div>

      <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.2rem" }}>Attendance weighting</div>
      <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.5rem" }}>
        How much a vote counts, by film screenings the voter attended. The highest bucket covers that many or more.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {form.attendanceBuckets.map((b, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.85rem" }}>From</span>
            <input value={b.from} onChange={e => setBucket(i, "from", e.target.value)} onBlur={tidyBuckets}
              inputMode="numeric" aria-label="Screenings attended" style={{ ...inputStyle, width: "4.5rem" }} />
            <span style={{ fontSize: "0.85rem" }}>screenings, counts</span>
            <input value={b.weight} onChange={e => setBucket(i, "weight", e.target.value)}
              inputMode="numeric" aria-label="Weight percent" style={{ ...inputStyle, width: "4.5rem" }} />
            <span style={{ fontSize: "0.85rem" }}>%</span>
            {form.attendanceBuckets.length > 1 && (
              <button type="button" onClick={() => removeBucket(i)} aria-label="Remove bucket"
                style={{ ...smallBtn, color: "var(--text-dim)", fontSize: "1rem", padding: "0 0.3rem" }}>✕</button>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.4rem" }}>
        {form.attendanceBuckets.length < MAX_BUCKETS
          ? <button type="button" onClick={addBucket} style={smallBtn}>+ Add bucket</button>
          : <span />}
        {bucketsValid && <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>{bucketSummary(candidate.attendanceBuckets)}</span>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
        {MAIN_KEYS.map(k => <NumberField key={k} k={k} value={form[k]} onChange={v => set(k, v)} />)}
      </div>

      <button type="button" onClick={() => setShowAdvanced(s => !s)} style={{ ...smallBtn, marginTop: "0.9rem" }}>
        {showAdvanced ? "Hide scoring details ▲" : "Scoring details ▼"}
      </button>
      {showAdvanced && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.6rem" }}>
          {ADVANCED_KEYS.map(k => <NumberField key={k} k={k} value={form[k]} onChange={v => set(k, v)} />)}
        </div>
      )}

      {problem && dirty && <div style={{ color: "var(--red, #c0392b)", fontSize: "0.85rem", marginTop: "0.75rem" }}>{problem}</div>}
      {message && <div style={{ color: message.error ? "var(--red, #c0392b)" : "var(--teal)", fontSize: "0.85rem", marginTop: "0.75rem" }}>{message.text}</div>}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.9rem" }}>
        <button type="button" onClick={save} disabled={!dirty || !!problem || saving}
          style={{ background: colour, color: "#fff", border: "none", borderRadius: 10, padding: "0.6rem 1.2rem", fontWeight: 700,
            fontFamily: "inherit", cursor: !dirty || problem || saving ? "not-allowed" : "pointer", opacity: !dirty || problem || saving ? 0.5 : 1 }}>
          {saving ? "Saving…" : "Save"}
        </button>
        {dirty && (
          <button type="button" onClick={() => { setMessage(null); setForm(toForm(loaded.config)) }}
            style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10,
              padding: "0.6rem 1rem", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
            Undo changes
          </button>
        )}
        <button type="button" onClick={() => { setMessage({ text: "Starting settings filled in. Tap Save to use them." }); setForm(toForm(loaded.defaults)) }}
          style={{ ...smallBtn, padding: "0.6rem 0.25rem" }}>
          Reset to starting settings
        </button>
      </div>
    </div>
  )
}
