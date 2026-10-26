"use client"
import { useEffect, useState } from "react"
import { authedFetch } from "@/lib/getAuthToken"
import { NIGHTS } from "@/lib/suggestionList"
import { bucketSummary } from "@/lib/fairPick"

// Show Time > Manage > Pick a Film (Element_Happenings_ShowTime_Fair_Pick_
// Scope_v1, Iain 2026-10-26). Ranks films per night by the Fair Pick score
// (lib/fairPick.js). Admins and Show Time Owners only -- the routes check.
// Voter names are never loaded with the list: "Show who voted" fetches them
// for one film on request, and they clear when the night or screen changes.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function monthYear(dateStr) {
  if (!dateStr) return ""
  const [y, m] = dateStr.split("-").map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

// "the last year" / "the last 180 days"
function periodText(days) {
  if (days === 365) return "the last year"
  if (days === 730) return "the last 2 years"
  return `the last ${days} days`
}

const LABEL_STYLE = {
  "Strong pick": { background: "var(--teal)", color: "#fff" },
  "Good pick":   { background: "var(--surface2)", color: "var(--teal)", border: "1px solid var(--teal)" },
  "Lukewarm":    { background: "var(--surface2)", color: "var(--text-dim)", border: "1px solid var(--border)" },
}

const pill = (active) => ({
  padding: "0.45rem 0.9rem", borderRadius: 999, fontSize: "0.85rem", fontWeight: 600,
  fontFamily: "inherit", cursor: "pointer",
  border: `1px solid ${active ? "var(--teal)" : "var(--border)"}`,
  background: active ? "var(--teal)" : "var(--surface)",
  color: active ? "#fff" : "var(--text)",
})

const tag = { fontSize: "0.72rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: 999, whiteSpace: "nowrap" }

function VoterList({ film, typical, period }) {
  const [state, setState] = useState({ loading: true })
  useEffect(() => {
    let live = true
    authedFetch(`/api/showtime/fair-pick/voters?movie=${encodeURIComponent(film.id)}&typical=${typical}`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (live) setState(ok ? { voters: d.voters } : { error: d.error || "Could not load voters" }) })
      .catch(() => { if (live) setState({ error: "Could not load voters" }) })
    return () => { live = false }
  }, [film.id, typical])

  if (state.loading) return <div style={{ padding: "0.5rem 0", color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</div>
  if (state.error) return <div style={{ padding: "0.5rem 0", color: "var(--red, #c0392b)", fontSize: "0.85rem" }}>{state.error}</div>
  return (
    <div style={{ marginTop: "0.5rem", borderTop: "1px solid var(--border)", paddingTop: "0.4rem" }}>
      {state.voters.map((v, i) => (
        <div key={i} style={{ padding: "0.35rem 0", borderBottom: i < state.voters.length - 1 ? "1px solid var(--border)" : "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.88rem" }}>
            <span style={{ fontWeight: 600, minWidth: 0 }}>{v.name}</span>
            <span style={{ fontWeight: 700 }}>{v.score}/10</span>
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
            {v.attended} film screening{v.attended === 1 ? "" : "s"} in {period}
            {v.notes.length > 0 && ` · ${v.notes.join(" · ")}`}
          </div>
        </div>
      ))}
    </div>
  )
}

function FilmRow({ film, rank, typical, period, open, onToggle }) {
  return (
    <div style={{ padding: "0.7rem 0.8rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
        {rank != null && (
          <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--teal)", minWidth: "1.6rem", textAlign: "right" }}>{rank}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{film.title}{film.year ? ` (${film.year})` : ""}</span>
            {film.label && <span style={{ ...tag, ...LABEL_STYLE[film.label] }}>{film.label}</span>}
            {film.split && <span style={{ ...tag, background: "var(--surface2)", color: "var(--amber)", border: "1px solid var(--amber)" }}>Split opinion</span>}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "0.15rem" }}>
            {film.count} vote{film.count === 1 ? "" : "s"} · average {film.avg.toFixed(1)}
            {film.we_own && " · On DVD"}
            {film.lastShown && ` · Last shown ${monthYear(film.lastShown)}`}
          </div>
          <button onClick={onToggle}
            style={{ marginTop: "0.35rem", background: "none", border: "none", padding: 0, color: "var(--teal)",
              fontWeight: 600, fontSize: "0.82rem", cursor: "pointer", fontFamily: "inherit" }}>
            {open ? "Hide who voted ▲" : "Show who voted ▼"}
          </button>
          {open && <VoterList film={film} typical={typical} period={period} />}
        </div>
      </div>
    </div>
  )
}

export default function FairPickPanel() {
  const [data, setData] = useState(null)
  const [config, setConfig] = useState(null)
  const [error, setError] = useState(null)
  const [night, setNight] = useState("sunday")
  const [dvdOnly, setDvdOnly] = useState(false)
  const [includeShown, setIncludeShown] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [showNeeds, setShowNeeds] = useState(false)
  const [showHow, setShowHow] = useState(false)

  useEffect(() => {
    authedFetch("/api/showtime/fair-pick")
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (ok) { setData(d.nights); setConfig(d.config) } else setError(d.error || "Could not load the ranking") })
      .catch(() => setError("Could not load the ranking"))
  }, [])

  // Names never carry over to another night or filter.
  useEffect(() => { setOpenId(null) }, [night, dvdOnly, includeShown])

  const keep = f => (!dvdOnly || f.we_own) && (includeShown || !f.lastShown)
  const n = data?.[night]
  const ranked = (n?.ranked || []).filter(keep)
  const needs = (n?.needsVotes || []).filter(keep)
  const toggle = id => setOpenId(o => (o === id ? null : id))

  return (
    <div>
      <h2 style={{ fontSize: "1.05rem", fontWeight: 800, margin: "0 0 0.25rem" }}>Pick a Film</h2>
      <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: "0.5rem" }}>
        Films ranked by residents&apos; votes, giving more say to regular attenders and less to habitual low scores.
        <button onClick={() => setShowHow(s => !s)}
          style={{ marginLeft: "0.35rem", background: "none", border: "none", padding: 0, color: "var(--teal)",
            fontWeight: 600, fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit" }}>
          {showHow ? "Hide" : "How it works"}
        </button>
      </div>
      {showHow && config && (
        <ul style={{ fontSize: "0.82rem", color: "var(--text-dim)", margin: "0 0 0.75rem", paddingLeft: "1.1rem", lineHeight: 1.45 }}>
          <li>Each vote is compared with how that person usually scores. A 1 from someone who often gives 1s counts for less than a 1 from someone who usually gives 8s.</li>
          <li>One low score can only pull a film down a little, so no one can veto a film.</li>
          <li>Votes count by film screenings attended in {periodText(config.attendanceDays)} (their own booking or a named seat): {bucketSummary(config.attendanceBuckets)}.</li>
          <li>No one voter can carry more than {config.maxVoterSharePct}% of a film&apos;s score. Films with fewer than {config.minRankedVotes} votes are listed under Needs more votes.</li>
          <li>Booked films, retired suggestions{config.recentShownDays > 0 ? ` and films shown in ${periodText(config.recentShownDays)}` : ""} are left out.</li>
          <li>Admins can change these settings in Admin › Hub Settings › Show Time.</li>
        </ul>
      )}

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        {NIGHTS.map(x => (
          <button key={x.key} onClick={() => setNight(x.key)} style={pill(night === x.key)}>{x.label}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <button onClick={() => setDvdOnly(v => !v)} style={pill(dvdOnly)}>On DVD only</button>
        <button onClick={() => setIncludeShown(v => !v)} style={pill(includeShown)}>Include films shown before</button>
      </div>

      {error && <div style={{ color: "var(--red, #c0392b)", fontSize: "0.88rem" }}>{error}</div>}
      {!data && !error && <div style={{ display: "flex", justifyContent: "center", padding: "1.5rem" }}><div className="spinner" /></div>}

      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {ranked.length === 0 && (
            <div style={{ fontSize: "0.88rem", color: "var(--text-dim)" }}>No films with {config.minRankedVotes} or more votes match these filters.</div>
          )}
          {ranked.map((f, i) => (
            <FilmRow key={f.id} film={f} rank={i + 1} typical={n.typical} period={periodText(config.attendanceDays)} open={openId === f.id} onToggle={() => toggle(f.id)} />
          ))}

          {needs.length > 0 && (
            <div style={{ marginTop: "0.5rem" }}>
              <button onClick={() => setShowNeeds(s => !s)}
                style={{ background: "none", border: "none", padding: "0.3rem 0", color: "var(--text)", fontWeight: 700,
                  fontSize: "0.9rem", cursor: "pointer", fontFamily: "inherit" }}>
                Needs more votes ({needs.length}) {showNeeds ? "▲" : "▼"}
              </button>
              {showNeeds && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.4rem" }}>
                  {needs.map(f => (
                    <FilmRow key={f.id} film={f} rank={null} typical={n.typical} period={periodText(config.attendanceDays)} open={openId === f.id} onToggle={() => toggle(f.id)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
