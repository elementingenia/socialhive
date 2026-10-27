"use client"
import { useEffect, useState } from "react"
import { authedFetch } from "@/lib/getAuthToken"
import { NIGHTS } from "@/lib/suggestionList"
import { bucketSummary } from "@/lib/fairPick"
import { Sheet } from "@/components/Sheet"

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

const NIGHT_LABEL = Object.fromEntries(NIGHTS.map(n => [n.key, n.label]))
const DVD_CHIP = { background: "var(--teal)", color: "#fff", borderRadius: 20, fontWeight: 700, whiteSpace: "nowrap" }
const chip = { background: "var(--surface2)", color: "var(--text-dim)", borderRadius: 20, padding: "0.2rem 0.6rem", fontSize: "0.75rem", whiteSpace: "nowrap" }

function Poster({ url, w, h }) {
  return url
    ? <img src={url} alt="" style={{ width: w, height: h, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
    : <div style={{ width: w, height: h, borderRadius: 6, flexShrink: 0, background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: w > 50 ? "1.8rem" : "1.1rem" }}>🎬</div>
}

// Tap a film: full details + every voter, highest score first (Iain,
// 2026-10-27, "like a coordinator view"). Names load only when a film is
// opened -- still on request, one film at a time.
function FilmSheet({ entry, typical, period, nightKey, onClose }) {
  const { film: f, rank } = entry
  const [state, setState] = useState({ loading: true })
  useEffect(() => {
    let live = true
    authedFetch(`/api/showtime/fair-pick/voters?movie=${encodeURIComponent(f.id)}&typical=${typical}`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (live) setState(ok ? { film: d.film, voters: d.voters } : { error: d.error || "Could not load this film" }) })
      .catch(() => { if (live) setState({ error: "Could not load this film" }) })
    return () => { live = false }
  }, [f.id, typical])

  const m = { ...f, ...(state.film || {}) }
  const genres = (m.genre || "").split(",").map(g => g.trim()).filter(Boolean)
  const imdbUrl = m.imdb_id ? `https://www.imdb.com/title/${m.imdb_id}/` : null
  const rtUrl = `https://www.rottentomatoes.com/search?search=${encodeURIComponent(m.title || "")}`
  const big = { fontSize: "1.3rem", fontWeight: 800, textDecoration: "none" }
  const small = { fontSize: "0.7rem", color: "var(--text-dim)" }

  return (
    <Sheet open onClose={onClose} title={rank != null ? `#${rank} on ${NIGHT_LABEL[nightKey]}` : "Needs more votes"}>
      <div style={{ padding: "1rem 1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        <div style={{ display: "flex", gap: "0.9rem" }}>
          <Poster url={m.poster_url} w={80} h={120} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: "1.15rem", lineHeight: 1.2 }}>
              {m.title}{m.rating && <span style={{ fontWeight: 400, fontSize: "0.75em", color: "var(--text-dim)" }}> ({m.rating})</span>}
            </div>
            <div style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: "0.2rem" }}>
              {[m.year, m.runtime].filter(Boolean).join(" · ")}
            </div>
            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginTop: "0.45rem" }}>
              {m.label && <span style={{ ...tag, ...LABEL_STYLE[m.label] }}>{m.label}</span>}
              {m.split && <span style={{ ...tag, background: "var(--surface2)", color: "var(--amber)", border: "1px solid var(--amber)" }}>Split opinion</span>}
              {m.we_own && <span style={{ ...DVD_CHIP, padding: "0.15rem 0.55rem", fontSize: "0.72rem" }}>📀 On DVD</span>}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ ...big, color: "var(--teal)" }}>{m.avg != null ? m.avg.toFixed(1) : "–"}</div>
            <div style={small}>Community ({m.count})</div>
          </div>
          {m.rating_imdb && (
            <div style={{ textAlign: "center" }}>
              {imdbUrl
                ? <a href={imdbUrl} target="_blank" rel="noopener noreferrer" style={{ ...big, color: "var(--amber-dark)" }}>★ {m.rating_imdb}</a>
                : <div style={{ ...big, color: "var(--amber-dark)" }}>★ {m.rating_imdb}</div>}
              <div style={small}>IMDb</div>
            </div>
          )}
          {m.rating_rt && (
            <div style={{ textAlign: "center" }}>
              <a href={rtUrl} target="_blank" rel="noopener noreferrer" style={{ ...big, color: "#fa320a" }}>🍅 {m.rating_rt}</a>
              <div style={small}>Rotten Tomatoes</div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", fontSize: "0.85rem" }}>
          {imdbUrl && <a href={imdbUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal)", fontWeight: 600 }}>Open on IMDb ↗</a>}
          <a href={rtUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal)", fontWeight: 600 }}>Open on Rotten Tomatoes ↗</a>
        </div>

        {(genres.length > 0 || m.lastShown) && (
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            {genres.map(g => <span key={g} style={chip}>{g}</span>)}
            {m.lastShown && <span style={chip}>Last shown {monthYear(m.lastShown)}</span>}
          </div>
        )}
        {m.director && <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}><strong>Director:</strong> {m.director}</div>}
        {m.actors && <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}><strong>Cast:</strong> {m.actors}</div>}
        {m.plot && <div style={{ fontSize: "0.88rem", lineHeight: 1.55 }}>{m.plot}</div>}

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
          <div style={{ fontWeight: 800, fontSize: "0.95rem", marginBottom: "0.35rem" }}>
            Who voted{state.voters ? ` (${state.voters.length})` : ""}
          </div>
          {state.loading && <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</div>}
          {state.error && <div style={{ color: "var(--red, #c0392b)", fontSize: "0.85rem" }}>{state.error}</div>}
          {state.voters?.map((v, i) => (
            <div key={i} style={{ padding: "0.45rem 0", borderBottom: i < state.voters.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", fontSize: "0.9rem" }}>
                <span style={{ fontWeight: 600, minWidth: 0 }}>{v.name}</span>
                <span style={{ fontWeight: 800, color: "var(--teal)", whiteSpace: "nowrap" }}>{v.score}/10</span>
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
                {v.attended} film screening{v.attended === 1 ? "" : "s"} in {period}
                {v.notes.length > 0 && ` · ${v.notes.join(" · ")}`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  )
}

function FilmRow({ film, rank, onOpen }) {
  return (
    <button type="button" onClick={onOpen}
      style={{ width: "100%", textAlign: "left", fontFamily: "inherit", color: "var(--text)", cursor: "pointer",
        padding: "0.55rem 0.7rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
        display: "flex", gap: "0.6rem", alignItems: "center" }}>
      {rank != null && (
        <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--teal)", minWidth: "1.6rem", textAlign: "right" }}>{rank}</div>
      )}
      <Poster url={film.poster_url} w={40} h={60} />
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
      </div>
      <span style={{ color: "var(--teal)", fontSize: "1.1rem", flexShrink: 0 }}>›</span>
    </button>
  )
}

export default function FairPickPanel() {
  const [data, setData] = useState(null)
  const [config, setConfig] = useState(null)
  const [error, setError] = useState(null)
  const [night, setNight] = useState("sunday")
  const [dvdOnly, setDvdOnly] = useState(false)
  const [includeShown, setIncludeShown] = useState(false)
  const [selected, setSelected] = useState(null)   // { film, rank }
  const [showNeeds, setShowNeeds] = useState(false)
  const [showHow, setShowHow] = useState(false)

  useEffect(() => {
    authedFetch("/api/showtime/fair-pick")
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (ok) { setData(d.nights); setConfig(d.config) } else setError(d.error || "Could not load the ranking") })
      .catch(() => setError("Could not load the ranking"))
  }, [])

  // Names never carry over to another night or filter.
  useEffect(() => { setSelected(null) }, [night, dvdOnly, includeShown])

  const keep = f => (!dvdOnly || f.we_own) && (includeShown || !f.lastShown)
  const n = data?.[night]
  const ranked = (n?.ranked || []).filter(keep)
  const needs = (n?.needsVotes || []).filter(keep)

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
            <FilmRow key={f.id} film={f} rank={i + 1} onOpen={() => setSelected({ film: f, rank: i + 1 })} />
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
                    <FilmRow key={f.id} film={f} rank={null} onOpen={() => setSelected({ film: f, rank: null })} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {selected && n && (
        <FilmSheet entry={selected} typical={n.typical} period={periodText(config.attendanceDays)} nightKey={night} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
