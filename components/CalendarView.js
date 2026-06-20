"use client"
import { useState, useMemo } from "react"
import { HUB_COLOURS } from "@/lib/navUtils"

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d) {
  return d.toISOString().split("T")[0]
}

function addDays(d, n) {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

function localDate(dateStr) {
  // parse YYYY-MM-DD without timezone shift
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

function hubLabel(hub_type) {
  const labels = { movie: "Movie Night", bookclub: "Book Club", social: "Social", outings: "Outing" }
  return labels[hub_type] || hub_type
}

// ── Event Chip ────────────────────────────────────────────────────────────────
function EventChip({ event, onTap, compact = false }) {
  const colour = HUB_COLOURS[event.hub_type] || "var(--amber)"
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
        padding: compact ? "5px 8px" : "10px 12px",
        marginBottom: compact ? 2 : 6,
        cursor: "pointer",
        position: "relative",
      }}
    >
      <div style={{
        fontWeight: 600,
        fontSize: compact ? 12 : 15,
        color: isPrivate ? "#888" : "var(--text)",
        lineHeight: 1.2,
        fontStyle: isPrivate ? "italic" : "normal",
      }}>
        {isPrivate ? "Residents Only" : event.title}
      </div>
      {!compact && !isPrivate && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
            {fmtTime(event.event_time)}
          </span>
          <span style={{
            fontSize: 11,
            background: colour + "30",
            color: colour,
            padding: "1px 6px",
            borderRadius: 4,
            fontWeight: 500,
          }}>
            {hubLabel(event.hub_type)}
          </span>
          {max > 0 && (
            <span style={{ fontSize: 12, color: booked >= max ? "var(--danger)" : "var(--text-dim)" }}>
              {booked >= max ? "Full" : `${max - booked} left`}
            </span>
          )}
        </div>
      )}
      {/* My booking indicator */}
      {(hasMyBooking || hasWaitlist) && (
        <div style={{
          position: "absolute",
          top: compact ? 3 : 6,
          right: 8,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: hasMyBooking ? colour : "var(--amber)",
        }} />
      )}
    </button>
  )
}

// ── Week View (list by day) ───────────────────────────────────────────────────
function WeekView({ days, eventsByDate, onEventTap }) {
  const today = toDateStr(new Date())

  return (
    <div style={{ padding: "0 16px 16px" }}>
      {days.map(day => {
        const key = toDateStr(day)
        const dayEvents = eventsByDate[key] || []
        const isToday = key === today

        return (
          <div key={key} style={{ marginBottom: 16 }}>
            <div style={{
              fontWeight: isToday ? 700 : 600,
              fontSize: isToday ? 15 : 14,
              color: isToday ? "var(--amber-dark)" : "var(--text-dim)",
              padding: "8px 0 6px",
              borderBottom: "1px solid var(--border)",
              marginBottom: 8,
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
            {dayEvents.length === 0 ? (
              <div style={{ fontSize: 13, color: "#ccc", paddingLeft: 4, paddingBottom: 4 }}>
                No events
              </div>
            ) : (
              dayEvents.map(ev => (
                <EventChip key={ev.id} event={ev} onTap={onEventTap} />
              ))
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 4-Week View (compact grid) ────────────────────────────────────────────────
function FourWeekView({ days, eventsByDate, onEventTap }) {
  const today = toDateStr(new Date())
  // Group into weeks of 7
  const weeks = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }

  return (
    <div style={{ padding: "0 16px 16px" }}>
      {/* Day-of-week header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        marginBottom: 4,
      }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
          <div key={d} style={{
            textAlign: "center",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-dim)",
            padding: "4px 0",
          }}>{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 3,
          marginBottom: 8,
        }}>
          {week.map(day => {
            const key = toDateStr(day)
            const dayEvents = eventsByDate[key] || []
            const isToday = key === today

            return (
              <div key={key} style={{
                minHeight: 60,
                background: isToday ? "var(--amber-light)" : "var(--surface2)",
                borderRadius: 8,
                padding: "4px 3px",
                border: isToday ? "1px solid var(--amber)" : "1px solid transparent",
              }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: isToday ? 700 : 500,
                  color: isToday ? "var(--amber-dark)" : "var(--text-dim)",
                  textAlign: "center",
                  marginBottom: 3,
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
    </div>
  )
}

// ── Month View ────────────────────────────────────────────────────────────────
function MonthView({ events, onEventTap }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const today = toDateStr(new Date())

  // Events in current month
  const monthStart = toDateStr(viewMonth)
  const monthEndDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0)
  const monthEnd = toDateStr(monthEndDate)

  const monthEvents = events.filter(e => e.event_date >= monthStart && e.event_date <= monthEnd)
  const eventsByDate = {}
  for (const ev of monthEvents) {
    if (!eventsByDate[ev.event_date]) eventsByDate[ev.event_date] = []
    eventsByDate[ev.event_date].push(ev)
  }

  // Build calendar grid (Mon-first)
  const firstDay = viewMonth
  let startDow = firstDay.getDay() // 0=Sun
  if (startDow === 0) startDow = 7 // Mon=1..Sun=7
  const offsetDays = startDow - 1

  const daysInMonth = monthEndDate.getDate()
  const totalCells = Math.ceil((offsetDays + daysInMonth) / 7) * 7

  const cells = []
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - offsetDays + 1
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push(null)
    } else {
      const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), dayNum)
      cells.push(d)
    }
  }

  return (
    <div style={{ padding: "0 16px 16px" }}>
      {/* Month nav */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
      }}>
        <button
          onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
          style={{
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 18,
            cursor: "pointer",
            color: "var(--text)",
          }}
        >‹</button>
        <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>
          {fmtMonthYear(viewMonth)}
        </div>
        <button
          onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
          style={{
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 18,
            cursor: "pointer",
            color: "var(--text)",
          }}
        >›</button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} style={{
            textAlign: "center",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-dim)",
            padding: "4px 0",
          }}>{d}</div>
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
            <div key={key} style={{
              minHeight: 44,
              background: isToday ? "var(--amber-light)" : hasEvents ? "var(--surface2)" : "transparent",
              borderRadius: 8,
              padding: "4px 3px",
              border: isToday ? "1px solid var(--amber)" : "1px solid transparent",
            }}>
              <div style={{
                fontSize: 12,
                fontWeight: isToday ? 700 : 400,
                color: isToday ? "var(--amber-dark)" : "var(--text)",
                textAlign: "center",
                marginBottom: 2,
              }}>{day.getDate()}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 2, justifyContent: "center" }}>
                {dayEvents.map(ev => {
                  const colour = ev.is_public === false ? "#bbb" : (HUB_COLOURS[ev.hub_type] || "var(--amber)")
                  return (
                    <button
                      key={ev.id}
                      onClick={() => onEventTap(ev)}
                      title={ev.is_public === false ? "Residents Only" : ev.title}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: colour,
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Selected day events — show below grid when month dots are small */}
      {monthEvents.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", marginBottom: 10 }}>
            Upcoming this month
          </div>
          {Object.entries(eventsByDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dateStr, evs]) => (
              <div key={dateStr} style={{ marginBottom: 12 }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-dim)",
                  marginBottom: 5,
                  paddingBottom: 3,
                  borderBottom: "1px solid var(--border)",
                }}>
                  {fmtShortDate(localDate(dateStr))}
                </div>
                {evs.map(ev => (
                  <EventChip key={ev.id} event={ev} onTap={onEventTap} />
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

// ── CalendarView (main export) ────────────────────────────────────────────────
export default function CalendarView({ events = [], onEventTap }) {
  const [view, setView] = useState("week")

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const weekDays  = useMemo(() => Array.from({ length: 7  }, (_, i) => addDays(today, i)), [])
  const month4Days = useMemo(() => Array.from({ length: 28 }, (_, i) => addDays(today, i)), [])

  // Build eventsByDate map
  const eventsByDate = useMemo(() => {
    const map = {}
    for (const ev of events) {
      if (!map[ev.event_date]) map[ev.event_date] = []
      map[ev.event_date].push(ev)
    }
    return map
  }, [events])

  const viewBtns = [
    { id: "week",   label: "Week" },
    { id: "4week",  label: "4 Weeks" },
    { id: "month",  label: "Month" },
  ]

  return (
    <div>
      {/* View toggle */}
      <div style={{
        display: "flex",
        gap: 6,
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
      }}>
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
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Hub legend */}
      <div style={{
        display: "flex",
        gap: 12,
        padding: "8px 16px",
        overflowX: "auto",
        borderBottom: "1px solid var(--border)",
      }}>
        {[
          { key: "movie",    label: "Movie Night" },
          { key: "bookclub", label: "Book Club"   },
          { key: "social",   label: "Social"      },
          { key: "outings",  label: "Outings"     },
        ].map(({ key, label }) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: HUB_COLOURS[key] }} />
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Views */}
      {view === "week"  && <WeekView   days={weekDays}   eventsByDate={eventsByDate} onEventTap={onEventTap} />}
      {view === "4week" && <FourWeekView days={month4Days} eventsByDate={eventsByDate} onEventTap={onEventTap} />}
      {view === "month" && <MonthView   events={events}   onEventTap={onEventTap} />}
    </div>
  )
}
