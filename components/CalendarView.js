"use client"
import { useState, useMemo } from "react"
import { HUB_COLOURS } from "@/lib/navUtils"
import { useMyClubs } from "@/lib/useMyClubs"

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d) {
  // Use local date components to avoid UTC offset shifting the date for AU timezone
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d, n) {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

function localDate(dateStr) {
  const [y, m, day] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, day)
}

function fmtDayHeader(d) {
  return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })
}

function fmtShortDate(d) {
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
}

function fmtTime(t) {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  const ampm = h >= 12 ? "pm" : "am"
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${ampm}`
}

function fmtMonthYear(d) {
  return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" })
}

function hubKeyOf(ev) {
  // Club events are identified by club_id, never hub_type — this works both
  // before and after the Book Club cutover.
  return ev?.club_id ? "club" : ev?.hub_type
}
function hubLabel(hub_type) {
  const labels = { movie: "Movie Night", bookclub: "Book Club", social: "Social", club: "Club" }
  return labels[hub_type] || hub_type
}
// A club event shows its OWN club name and colour, so Dinner Club and Book
// Club stay distinguishable inside the single "Clubs" filter.
function eventLabel(ev) {
  return ev?.club?.name || hubLabel(ev?.hub_type)
}
function eventColour(ev) {
  return ev?.club?.colour || HUB_COLOURS[hubKeyOf(ev)] || "var(--amber)"
}

// Monday of the week containing date d
function getMondayOf(d) {
  const copy = new Date(d)
  const dow = copy.getDay() // 0=Sun
  const offset = dow === 0 ? -6 : 1 - dow // shift to Monday
  copy.setDate(copy.getDate() + offset)
  copy.setHours(0, 0, 0, 0)
  return copy
}

// ── Event Chip ────────────────────────────────────────────────────────────────
function EventChip({ event, onTap, compact = false }) {
  const colour = eventColour(event)
  const isPrivate = event.is_public === false
  const booked = event.bookings_count || 0
  const max = event.max_seats || 0
  const hasMyBooking = event.my_bookings?.some(b => b.status === "confirmed")
  const hasWaitlist  = event.my_bookings?.some(b => b.status === "waitlist")

  return (
    <button
      onClick={() => onTap(event)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: isPrivate ? "#f0f0f0" : colour + "18",
        borderLeft: `4px solid ${isPrivate ? "#bbb" : colour}`,
        borderTop: "none",
        borderRight: "none",
        borderBottom: "none",
        borderRadius: "0 8px 8px 0",
        padding: compact ? "4px 6px" : "10px 12px",
        marginBottom: compact ? 2 : 6,
        cursor: "pointer",
      }}
    >
      <div style={{
        fontWeight: compact ? 500 : 600,
        fontSize: compact ? 11 : 15,
        color: isPrivate ? "#888" : "var(--text)",
        lineHeight: 1.2,
        fontStyle: isPrivate ? "italic" : "normal",
        whiteSpace: compact ? "nowrap" : "normal",
        overflow: compact ? "hidden" : "visible",
        textOverflow: compact ? "ellipsis" : "unset",
      }}>
        {isPrivate ? "Private" : event.title}
      </div>
      {!compact && !isPrivate && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{fmtTime(event.event_time)}</span>
          <span style={{
            fontSize: 11,
            background: colour + "30",
            color: colour,
            padding: "1px 6px",
            borderRadius: 4,
            fontWeight: 500,
          }}>{eventLabel(event)}</span>
          {max > 0 && (
            <span style={{ fontSize: 12, color: booked >= max ? "var(--danger)" : "var(--text-dim)" }}>
              {booked}/{max}
            </span>
          )}
          {hasMyBooking && <span style={{ fontSize: 11, color: "#15803d", fontWeight: 700 }}>✓ Booked</span>}
          {hasWaitlist  && <span style={{ fontSize: 11, color: "var(--amber-dark)", fontWeight: 700 }}>Waitlisted</span>}
        </div>
      )}
    </button>
  )
}

// ── Week View ─────────────────────────────────────────────────────────────────
function WeekView({ days, eventsByDate, onEventTap }) {
  const today = toDateStr(new Date())

  return (
    <div style={{ padding: "0 16px 16px" }}>
      {days.map(day => {
        const key = toDateStr(day)
        const dayEvents = eventsByDate[key] || []
        const isToday = key === today

        return (
          <div key={key} style={{ marginBottom: dayEvents.length > 0 ? 16 : 4 }}>
            <div style={{
              fontWeight: isToday ? 700 : 600,
              fontSize: isToday ? 15 : 13,
              color: isToday ? "var(--amber-dark)" : "var(--text-dim)",
              padding: isToday ? "8px 0 6px" : "5px 0 4px",
              borderBottom: "1px solid var(--border)",
              marginBottom: dayEvents.length > 0 ? 8 : 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              {fmtDayHeader(day)}
              {isToday && (
                <span style={{
                  fontSize: 11,
                  background: "var(--amber)",
                  color: "#fff",
                  padding: "1px 7px",
                  borderRadius: 20,
                  fontWeight: 600,
                }}>Today</span>
              )}
            </div>
            {dayEvents.map(ev => (
              <EventChip key={ev.id} event={ev} onTap={onEventTap} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── 4-Week View ───────────────────────────────────────────────────────────────
function FourWeekView({ days, eventsByDate, onEventTap }) {
  const today = toDateStr(new Date())
  const weeks = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }

  // Upcoming events sorted
  const upcoming = days
    .flatMap(d => eventsByDate[toDateStr(d)] || [])
    .filter(ev => ev.event_date >= today)
    .sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.event_time || "").localeCompare(b.event_time || ""))

  // Group upcoming by date for list
  const upcomingByDate = {}
  for (const ev of upcoming) {
    if (!upcomingByDate[ev.event_date]) upcomingByDate[ev.event_date] = []
    upcomingByDate[ev.event_date].push(ev)
  }

  return (
    <div style={{ padding: "0 16px 16px" }}>
      {/* Day-of-week header — always Mon–Sun since grid starts on Monday */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-dim)", padding: "4px 0" }}>{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 6 }}>
          {week.map(day => {
            const key = toDateStr(day)
            const dayEvents = eventsByDate[key] || []
            const isToday = key === today
            const isPast  = key < today

            return (
              <div key={key} style={{
                minHeight: 48,
                background: isToday ? "var(--amber-light)" : "var(--surface2)",
                borderRadius: 8,
                padding: "4px 3px",
                border: isToday ? "1px solid var(--amber)" : "1px solid transparent",
                opacity: isPast ? 0.5 : 1,
              }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: isToday ? 700 : 500,
                  color: isToday ? "var(--amber-dark)" : "var(--text-dim)",
                  textAlign: "center",
                  marginBottom: 2,
                }}>
                  {day.getDate()}
                </div>
                {dayEvents.map(ev => (
                  <EventChip key={ev.id} event={ev} onTap={onEventTap} compact />
                ))}
              </div>
            )
          })}
        </div>
      ))}

      {/* Upcoming events list */}
      {Object.keys(upcomingByDate).length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", marginBottom: 10 }}>Upcoming</div>
          {Object.entries(upcomingByDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dateStr, evs]) => (
              <div key={dateStr} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)", marginBottom: 5, paddingBottom: 3, borderBottom: "1px solid var(--border)" }}>
                  {fmtShortDate(localDate(dateStr))}
                </div>
                {evs.map(ev => <EventChip key={ev.id} event={ev} onTap={onEventTap} />)}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

// ── Day picker overlay (for days with multiple events) ────────────────────────
function DayPickerOverlay({ date, events, onSelect, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 480, background: "var(--surface)", borderRadius: "20px 20px 0 0", padding: "1.25rem" }}
      >
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{fmtShortDate(date)}</div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>{events.length} events — tap to open</div>
        {events.map(ev => (
          <button
            key={ev.id}
            onClick={() => { onClose(); onSelect(ev) }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              background: "var(--surface2)",
              border: "none",
              borderLeft: `4px solid ${eventColour(ev)}`,
              borderRadius: "0 10px 10px 0",
              padding: "0.75rem 1rem",
              marginBottom: 8,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{ev.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
                {fmtTime(ev.event_time)} · {eventLabel(ev)}
              </div>
            </div>
            <span style={{ color: "var(--text-dim)", fontSize: 16 }}>›</span>
          </button>
        ))}
        <button
          onClick={onClose}
          style={{ width: "100%", padding: "0.7rem", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 14, fontWeight: 600, color: "var(--text-dim)", cursor: "pointer", marginTop: 4 }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Month View ────────────────────────────────────────────────────────────────
function MonthView({ events, onEventTap }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [pickerDay, setPickerDay] = useState(null) // { date, events } for multi-event picker
  const today = toDateStr(new Date())

  const monthStart = toDateStr(viewMonth)
  const monthEndDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0)
  const monthEnd = toDateStr(monthEndDate)

  const monthEvents = events.filter(e => e.event_date >= monthStart && e.event_date <= monthEnd)
  const eventsByDate = {}
  for (const ev of monthEvents) {
    if (!eventsByDate[ev.event_date]) eventsByDate[ev.event_date] = []
    eventsByDate[ev.event_date].push(ev)
  }

  // Build grid (Mon-first)
  let startDow = viewMonth.getDay()
  if (startDow === 0) startDow = 7
  const offsetDays = startDow - 1
  const daysInMonth = monthEndDate.getDate()
  const totalCells = Math.ceil((offsetDays + daysInMonth) / 7) * 7

  const cells = []
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - offsetDays + 1
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push(null)
    } else {
      cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), dayNum))
    }
  }

  function handleDayTap(day, dayEvents) {
    if (dayEvents.length === 0) return
    if (dayEvents.length === 1) {
      onEventTap(dayEvents[0])
    } else {
      setPickerDay({ date: day, events: dayEvents })
    }
  }

  return (
    <div style={{ padding: "0 16px 16px" }}>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button
          onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
          style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 14px", fontSize: 18, cursor: "pointer", color: "var(--text)" }}
        >‹</button>
        <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>{fmtMonthYear(viewMonth)}</div>
        <button
          onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
          style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 14px", fontSize: 18, cursor: "pointer", color: "var(--text)" }}
        >›</button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-dim)", padding: "4px 0" }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const key = toDateStr(day)
          const dayEvents = eventsByDate[key] || []
          const isToday = key === today
          const hasEvents = dayEvents.length > 0

          return (
            <div
              key={key}
              onClick={() => handleDayTap(day, dayEvents)}
              style={{
                minHeight: 44,
                background: isToday ? "var(--amber-light)" : hasEvents ? "var(--surface2)" : "transparent",
                borderRadius: 8,
                padding: "4px 3px",
                border: isToday ? "1px solid var(--amber)" : "1px solid transparent",
                cursor: hasEvents ? "pointer" : "default",
              }}
            >
              <div style={{
                fontSize: 12,
                fontWeight: isToday ? 700 : 400,
                color: isToday ? "var(--amber-dark)" : "var(--text)",
                textAlign: "center",
                marginBottom: 2,
              }}>{day.getDate()}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 2, justifyContent: "center" }}>
                {dayEvents.map(ev => {
                  const colour = ev.is_public === false ? "#bbb" : eventColour(ev)
                  return (
                    <div
                      key={ev.id}
                      title={ev.is_public === false ? "Private" : ev.title}
                      style={{ width: 8, height: 8, borderRadius: "50%", background: colour }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Upcoming events list */}
      {monthEvents.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", marginBottom: 10 }}>
            Upcoming this month
          </div>
          {Object.entries(eventsByDate)
            .filter(([d]) => d >= today)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dateStr, evs]) => (
              <div key={dateStr} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)", marginBottom: 5, paddingBottom: 3, borderBottom: "1px solid var(--border)" }}>
                  {fmtShortDate(localDate(dateStr))}
                </div>
                {evs.map(ev => <EventChip key={ev.id} event={ev} onTap={onEventTap} />)}
              </div>
            ))}
        </div>
      )}

      {/* Multi-event day picker */}
      {pickerDay && (
        <DayPickerOverlay
          date={pickerDay.date}
          events={pickerDay.events}
          onSelect={onEventTap}
          onClose={() => setPickerDay(null)}
        />
      )}
    </div>
  )
}

// ── CalendarView (main export) ────────────────────────────────────────────────
export default function CalendarView({ events = [], onEventTap, defaultView = "week" }) {
  const [view, setView] = useState(defaultView)
  const [activeHubs, setActiveHubs] = useState(["movie", "club", "social"])
  // Club filter: 'all' | 'mine' | a specific club id (Iain 2026-07-18).
  const [clubScope, setClubScope] = useState("all")
  const { myClubIds } = useMyClubs()
  const clubsInView = useMemo(() => {
    const seen = new Map()
    for (const ev of events) if (ev.club_id && ev.club) seen.set(ev.club_id, ev.club)
    return [...seen.values()].sort((a, b) => (a.name || "").localeCompare(b.name || ""))
  }, [events])
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Week view: 7 days from today
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [])

  // 4-week view: 28 days starting from Monday of the current week
  const monday = useMemo(() => getMondayOf(today), [])
  const month4Days = useMemo(() => Array.from({ length: 28 }, (_, i) => addDays(monday, i)), [monday])

  const filteredEvents = useMemo(() => events.filter(ev => {
    const key = hubKeyOf(ev)
    if (!activeHubs.includes(key)) return false
    if (key === "club") {
      if (clubScope === "hide") return false
      if (clubScope === "mine" && !myClubIds.has(ev.club_id)) return false
      if (clubScope !== "all" && clubScope !== "mine" && ev.club_id !== clubScope) return false
    }
    return true
  }), [events, activeHubs, clubScope, myClubIds])

  const eventsByDate = useMemo(() => {
    const map = {}
    for (const ev of filteredEvents) {
      if (!map[ev.event_date]) map[ev.event_date] = []
      map[ev.event_date].push(ev)
    }
    return map
  }, [filteredEvents])

  const viewBtns = [
    { id: "week",  label: "Week"    },
    { id: "4week", label: "4 Weeks" },
    { id: "month", label: "Month"   },
  ]

  return (
    <div>
      {/* View toggle */}
      <div style={{ display: "flex", gap: 6, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        {viewBtns.map(btn => (
          <button
            key={btn.id}
            onClick={() => setView(btn.id)}
            style={{
              flex: 1,
              padding: "8px 0",
              background: view === btn.id ? "var(--amber)" : "var(--surface2)",
              color: view === btn.id ? "#fff" : "var(--text-dim)",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >{btn.label}</button>
        ))}
      </div>

      {/* Hub filters — tap to toggle */}
      <div style={{ display: "flex", gap: 8, padding: "8px 16px", overflowX: "auto", borderBottom: "1px solid var(--border)" }}>
        {[
          { key: "movie",    label: "Movies"    },
          { key: "social",   label: "Social"    },
        ].map(({ key, label }) => {
          const on = activeHubs.includes(key)
          const colour = HUB_COLOURS[key] || "var(--amber)"
          return (
            <button
              key={key}
              onClick={() => setActiveHubs(prev =>
                prev.includes(key) ? prev.filter(h => h !== key) : [...prev, key]
              )}
              style={{
                display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                padding: "4px 10px", borderRadius: 20,
                border: `1px solid ${on ? colour : "var(--border)"}`,
                background: on ? colour + "20" : "var(--surface2)",
                cursor: "pointer", fontFamily: "inherit",
                opacity: on ? 1 : 0.55,
                transition: "all 0.15s",
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: on ? colour : "var(--text-dim)", flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: on ? colour : "var(--text-dim)" }}>{label}</span>
            </button>
          )
        })}

        {/* Club scope IS the clubs filter: All / My clubs / a specific club (Iain 2026-07-19).
            Always purple; the standalone "Clubs" toggle pill was removed as redundant.
            WebkitTextSizeAdjust pins the native-select text against iPad's narrow-column
            font inflation (same text-size-adjust quirk as ExpandableText). */}
        {(clubsInView.length > 0 || myClubIds.size > 0) && (
          <select value={clubScope} onChange={e => setClubScope(e.target.value)}
            style={{ flexShrink: 0, maxWidth: 150, padding: "4px 10px", borderRadius: 20,
              fontSize: 12, fontWeight: 600, lineHeight: 1.2,
              WebkitTextSizeAdjust: "100%", textSizeAdjust: "100%",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              border: "1px solid var(--purple)", background: "var(--surface2)",
              color: "var(--purple)", fontFamily: "inherit",
              appearance: "none", WebkitAppearance: "none", cursor: "pointer" }}>
            <option value="all">All clubs</option>
            <option value="mine">My clubs</option>
            <option value="hide">Hide clubs</option>
            {clubsInView.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {view === "week"  && <WeekView     days={weekDays}   eventsByDate={eventsByDate} onEventTap={onEventTap} />}
      {view === "4week" && <FourWeekView days={month4Days} eventsByDate={eventsByDate} onEventTap={onEventTap} />}
      {view === "month" && <MonthView    events={filteredEvents}   onEventTap={onEventTap} />}
    </div>
  )
}
