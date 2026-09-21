"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

// Shared "Past Events" accordion for every hub landing page and each club
// (Iain, 2026-09-21: "in all hubs and Groups & Clubs, there now needs to be
// a past events option, closed by default but able to open and show all
// past non-archived events"). ONE shared component so this looks and
// behaves identically everywhere (feedback_ui_consistency.md) rather than
// five bespoke copies -- pass hubType for a hub, or clubId for a specific
// club, never both.
//
// Deliberately separate from the pre-existing pastOpen accordions already
// on /social/events and /special-events/events -- those live on each hub's
// own booking-history sub-page and predate this feature; this one lives on
// the hub's LANDING page and is scoped specifically to Happenings News
// (every past event, links through to its post if one exists, drops an
// event out once its post archives). No overlap/duplication: different
// page, different purpose.
// onOpenEvent(eventId) — optional. When passed, a row with no recap yet is
// still clickable: it opens the event itself (each hub page's own slide-out
// opener) so the event's Coordinator can reach the "Write a Happenings News
// post" entry point inside CoordinatorPanel. Fixed 2026-09-22 (Iain: as
// Movies' coordinator, no way to post about a past screening he hadn't
// personally booked -- confirmed root cause: rows with no post_id were
// hard-disabled here, and no other UI path opens a past event with no
// booking on it. Every hub page now passes its existing open-by-id function.
export default function PastEventsAccordion({ hubType, clubId, colour = "var(--happenings-news)", onOpenEvent }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState(null) // null = not loaded yet

  useEffect(() => {
    if (!open || events !== null) return
    let cancelled = false
    const qs = clubId ? `club_id=${clubId}` : `hub_type=${hubType}`
    fetch(`/api/happenings-news/past-events?${qs}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setEvents(json.events || []) })
      .catch(() => { if (!cancelled) setEvents([]) })
    return () => { cancelled = true }
  }, [open, events, hubType, clubId])

  function fmt(dateStr) {
    if (!dateStr) return ""
    const [y, m, d] = dateStr.split("-").map(Number)
    return new Date(y, m - 1, d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
  }

  return (
    <div style={{ background: "var(--surface)", borderRadius: 14, border: "1px solid var(--border)", overflow: "hidden", marginTop: "0.75rem" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "1rem", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
      }}>
        <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>🗓️ Past Events</span>
        <span style={{ color: "var(--text-dim)", fontSize: "1rem", display: "inline-block",
          transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
      </button>
      {open && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "0.5rem 0.75rem 0.75rem" }}>
          {events === null ? (
            <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</div>
          ) : events.length === 0 ? (
            <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-dim)", fontSize: "0.85rem" }}>No past events yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {events.map(ev => {
                // Clickable whenever there's a recap to read, OR the parent
                // page gave us a way to open the event itself (so its
                // Coordinator can reach the "Write a recap" entry point).
                const clickable = !!ev.post_id || !!onOpenEvent
                return (
                  <button key={ev.id}
                    onClick={() => {
                      if (ev.post_id) router.push(`/happenings-news?post=${ev.post_id}`)
                      else if (onOpenEvent) onOpenEvent(ev.id)
                    }}
                    disabled={!clickable}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.6rem",
                      padding: "0.6rem 0.7rem", borderRadius: 10, border: "1px solid var(--border)",
                      background: "var(--surface2)", textAlign: "left", fontFamily: "inherit",
                      cursor: clickable ? "pointer" : "default",
                    }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.85rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.title}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>{fmt(ev.event_date)}</div>
                    </div>
                    {ev.post_id ? (
                      <span style={{ flexShrink: 0, fontSize: "0.7rem", fontWeight: 700, color: colour }}>📰 Read recap</span>
                    ) : (
                      <span style={{ flexShrink: 0, fontSize: "0.7rem", color: "var(--text-dim)" }}>{clickable ? "No recap yet →" : "No recap"}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
