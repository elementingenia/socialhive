"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { authedFetch } from "@/lib/getAuthToken"
import { EventChip } from "@/components/CalendarView"
import { eventDeepLinkFor } from "@/lib/eventNav"
import { isEventPast, localDateFromStr } from "@/lib/date"

// Weekly Digest page (Iain, 2026-10-02) -- where the Sunday "This week at
// Element Happenings" notification lands. Events come from /api/events
// (same data and tiles as Calendar); everything else from /api/digest.
// Every section renders nothing at all when empty (vertical space rule).

function fmtDay(dateStr) {
  return localDateFromStr(dateStr).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })
}
function fmtCloses(iso) {
  return new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Sydney" })
}
function fmtTime(t) {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: "0.5rem" }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function LinkRow({ onClick, main, sub }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: "block", width: "100%", textAlign: "left", background: "var(--surface)",
      border: "1px solid var(--border)", borderRadius: 10, padding: "0.75rem 0.9rem", marginBottom: 6,
      cursor: "pointer", fontFamily: "inherit", color: "var(--text)",
    }}>
      <div style={{ fontSize: "0.95rem", fontWeight: 600, lineHeight: 1.3 }}>{main}</div>
      {sub && <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginTop: 2 }}>{sub}</div>}
    </button>
  )
}

export default function DigestPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [digest, setDigest] = useState(null)
  const [events, setEvents] = useState([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const dRes = await authedFetch("/api/digest")
        const d = await dRes.json()
        if (!dRes.ok) throw new Error(d.error || "Couldn't load this week's digest")
        const eRes = await authedFetch(`/api/events?from=${d.window.from}&to=${d.window.to}`)
        const ev = eRes.ok ? await eRes.json() : []
        if (cancelled) return
        setDigest(d)
        setEvents((ev || []).filter(e => !isEventPast(e)))
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) return <div style={{ padding: "2rem 1rem", textAlign: "center", color: "var(--text-dim)" }}>Loading this week…</div>
  if (error) return <div style={{ padding: "2rem 1rem", textAlign: "center", color: "var(--danger)" }}>{error}</div>

  const { items, invites } = digest
  const byDate = {}
  for (const ev of events) {
    if (!byDate[ev.event_date]) byDate[ev.event_date] = []
    byDate[ev.event_date].push(ev)
  }
  const nothing = events.length === 0 && invites.length === 0 && Object.values(items).every(a => a.length === 0)

  return (
    <div style={{ padding: "1rem 1rem 6rem", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.2rem" }}>This week at Element Happenings</div>
      <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: "1.1rem" }}>
        {fmtDay(digest.window.from)} to {fmtDay(digest.window.to)}
      </div>

      {nothing && (
        <div style={{ padding: "1.5rem 1rem", textAlign: "center", color: "var(--text-dim)", fontSize: "0.95rem" }}>
          Nothing on this week yet. Check the Calendar for what's coming up later.
        </div>
      )}

      {invites.length > 0 && (
        <Section title="Invites for you">
          {invites.map(i => (
            <LinkRow key={i.id} onClick={() => i.url && router.push(i.url)}
              main={i.event.title}
              sub={`${i.from_name} thinks you'd enjoy this · ${fmtDay(i.event.event_date)}${i.event.event_time ? `, ${fmtTime(i.event.event_time)}` : ""}`} />
          ))}
        </Section>
      )}

      {events.length > 0 && (
        <Section title={`What's on (${events.length})`}>
          {Object.keys(byDate).sort().map(dateStr => (
            <div key={dateStr} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)", marginBottom: 5, paddingBottom: 3, borderBottom: "1px solid var(--border)" }}>
                {fmtDay(dateStr)}
              </div>
              {byDate[dateStr].map(ev => (
                <EventChip key={ev.id} event={ev} onTap={e => { const t = eventDeepLinkFor(e); if (t) router.push(t) }} />
              ))}
            </div>
          ))}
        </Section>
      )}

      {items.newGroups.length > 0 && (
        <Section title="New groups & clubs">
          {items.newGroups.map(g => (
            <LinkRow key={g.id} onClick={() => router.push(`/clubs/${g.slug}`)} main={g.name} sub="New this week — take a look" />
          ))}
        </Section>
      )}

      {items.news.length > 0 && (
        <Section title="Happenings News">
          {items.news.map(p => (
            <LinkRow key={p.id} onClick={() => router.push("/happenings-news")} main={p.title} sub="New recap with photos" />
          ))}
        </Section>
      )}

      {items.committee.length > 0 && (
        <Section title="From the Committee">
          {items.committee.map(c => (
            <LinkRow key={c.id} onClick={() => router.push("/committee")} main={c.snippet || "Committee update"} />
          ))}
        </Section>
      )}

      {items.votes.length > 0 && (
        <Section title="Votes open">
          {items.votes.map(v => (
            <LinkRow key={v.id} onClick={() => router.push("/voting")} main={v.title} sub={`Closes ${fmtCloses(v.closes_at)}`} />
          ))}
        </Section>
      )}

      {items.surveys.length > 0 && (
        <Section title="Surveys open">
          {items.surveys.map(s => (
            <LinkRow key={s.id} onClick={() => router.push("/surveys")} main={s.title} sub={`Closes ${fmtCloses(s.closes_at)}`} />
          ))}
        </Section>
      )}
    </div>
  )
}
