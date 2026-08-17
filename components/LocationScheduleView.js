"use client"
import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { authedFetch } from "@/lib/getAuthToken"
import { useLocations } from "@/lib/useLocations"
import { sydneyTodayStr, sydneyDateStrPlusDays, localDateFromStr } from "@/lib/date"
import { toInstant, sydneyOffsetMinutes } from "@/lib/spaces"

// Book by Location -- Social_Hive_Location_First_Booking_Scope_v2.md
// (decisions locked 2026-08-16/17, Iain). Second entry point into the same
// booking engine as SpaceBookingForm: pick a location first, see what's
// already on there over the next ~2 weeks (day-list, decision #2), then
// hand off into SpaceBookingForm with the location + date pre-filled to
// finish the actual booking (time picker, reason, Ingenia confirmation,
// clash re-check -- all unchanged, this view never books directly).
//
// All 12 bookable locations, same constraints as the date-first flow
// (decision #3) -- no special-casing by room. A closed location shows its
// existing closed_reason, greyed out (decision #4).

const DAYS_AHEAD = 14

function Portal({ children }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted ? createPortal(children, document.body) : null
}

function dayList() {
  const days = []
  for (let i = 0; i < DAYS_AHEAD; i++) days.push(sydneyDateStrPlusDays(i))
  return days
}

function fmtDay(dateStr) {
  const d = localDateFromStr(dateStr)
  if (!d) return dateStr
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
}

// Lightbox -- new UI, no precedent elsewhere in the app yet (per scope v2
// item 6), same Portal pattern SpaceBookingForm already uses for its sheet.
function ImageLightbox({ src, onClose }) {
  if (!src) return null
  return (
    <Portal>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 600,
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", cursor: "zoom-out",
      }}>
        <img src={src} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 12, objectFit: "contain" }} />
      </div>
    </Portal>
  )
}

export default function LocationScheduleView({ open, onClose, onPickSlot }) {
  const allLocations = useLocations()
  const [locationId, setLocationId] = useState(null)
  const [schedule, setSchedule] = useState(null) // { bookings, events } or null while loading
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [lightboxSrc, setLightboxSrc] = useState(null)

  useEffect(() => {
    if (open) { setLocationId(null); setSchedule(null); setError(""); setLightboxSrc(null) }
  }, [open])

  const loadSchedule = useCallback(async (locId) => {
    setLoading(true); setError("")
    try {
      const days = dayList()
      const from = days[0]
      const to = days[days.length - 1]
      const fromInstant = toInstant(from, "00:00", sydneyOffsetMinutes(from)).toISOString()
      const toInstantEnd = toInstant(to, "23:59", sydneyOffsetMinutes(to)).toISOString()
      const res = await authedFetch(`/api/spaces?calendar_from=${encodeURIComponent(fromInstant)}&calendar_to=${encodeURIComponent(toInstantEnd)}&location_id=${locId}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Could not load that space's schedule"); setSchedule({ bookings: [], events: [] }); return }
      setSchedule({ bookings: data.bookings || [], events: data.events || [] })
    } catch {
      setError("Could not load that space's schedule — check your connection")
      setSchedule({ bookings: [], events: [] })
    } finally {
      setLoading(false)
    }
  }, [])

  function pickLocation(loc) {
    setLocationId(loc.id)
    loadSchedule(loc.id)
  }

  const selectedLocation = (allLocations || []).find(l => l.id === locationId) || null
  const closed = selectedLocation?.booking_status === "closed"

  function itemsForDay(dateStr) {
    if (!schedule) return []
    const fromBookings = (schedule.bookings || [])
      .filter(b => (b.starts_at || "").slice(0, 10) === dateStr || sameSydneyDay(b.starts_at, dateStr))
      .map(b => ({
        key: `b:${b.id}`, kind: "booking",
        label: b.title ? `${b.booked_by_name} — ${b.title}` : b.booked_by_name,
      }))
    const fromEvents = (schedule.events || [])
      .filter(e => e.event_date === dateStr)
      .map(e => ({ key: `e:${e.id}`, kind: "event", label: e.title || "An event" }))
    return [...fromEvents, ...fromBookings]
  }

  function sameSydneyDay(iso, dateStr) {
    if (!iso) return false
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date(iso)) === dateStr
  }

  function handleClose() { onClose?.() }

  return (
    <>
    <Portal>
      <div onClick={handleClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300,
        opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity 0.25s ease",
      }} />

      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "min(440px, 96vw)",
        background: "var(--surface)", zIndex: 301, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch",
        transform: open ? "translateX(0)" : "translateX(100%)", pointerEvents: open ? "auto" : "none",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.15)", paddingBottom: 32,
      }}>
        <div style={{ height: 6, background: "var(--teal)" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px",
          borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {selectedLocation ? (
              <button type="button" onClick={() => { setLocationId(null); setSchedule(null) }}
                style={{ background: "none", border: "none", color: "var(--teal)", fontWeight: 700, fontSize: 15, cursor: "pointer", padding: 0 }}>
                ← {selectedLocation.name}
              </button>
            ) : "Book by Location"}
          </div>
          <button onClick={handleClose} style={{ background: "var(--surface2)", border: "none", borderRadius: "50%",
            width: 36, height: 36, fontSize: 20, cursor: "pointer", color: "var(--text)",
            display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {!selectedLocation ? (
          <div style={{ padding: "1.1rem" }}>
            <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginBottom: "1rem", lineHeight: 1.5 }}>
              Pick a space to see what's already booked over the next two weeks, then book a free slot directly.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {(allLocations || []).map(loc => (
                <button key={loc.id} type="button" onClick={() => pickLocation(loc)} style={{
                  display: "flex", alignItems: "center", gap: "0.6rem", textAlign: "left", padding: "0.6rem 0.8rem",
                  borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer",
                }}>
                  {loc.image_url ? (
                    <img src={loc.image_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--surface2)", flexShrink: 0 }} />
                  )}
                  <span style={{ fontWeight: 600, fontSize: "0.9rem", flex: 1 }}>{loc.name}</span>
                  {loc.booking_status === "closed" && (
                    <span style={{ fontSize: "0.66rem", fontWeight: 700, padding: "0.12rem 0.4rem", borderRadius: 6,
                      background: "#b453091f", color: "#b45309" }}>Closed</span>
                  )}
                </button>
              ))}
              {allLocations && allLocations.length === 0 && (
                <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>No bookable spaces found.</div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ padding: "1.1rem" }}>
            {selectedLocation.image_url && (
              <img
                src={selectedLocation.image_url} alt=""
                onClick={() => setLightboxSrc(selectedLocation.image_url)}
                style={{ width: "100%", height: 140, borderRadius: 10, objectFit: "cover", marginBottom: "0.9rem", cursor: "zoom-in" }}
              />
            )}

            {closed && (
              <div style={{ background: "#b453090f", border: "1px solid #b45309", borderRadius: 10,
                padding: "0.7rem 0.9rem", fontSize: "0.85rem", color: "var(--text)", marginBottom: "1rem" }}>
                {selectedLocation.closed_reason
                  ? `Closed for bookings — ${selectedLocation.closed_reason}`
                  : "Closed for bookings until further notice."}
              </div>
            )}

            {error && (
              <div style={{ background: "var(--danger-bg, #fdecea)", color: "var(--danger)", border: "1px solid var(--danger)",
                borderRadius: 10, padding: "0.7rem 0.9rem", fontSize: "0.85rem", marginBottom: "1rem" }}>
                {error}
              </div>
            )}

            {loading ? (
              <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", padding: "1rem 0" }}>Loading schedule…</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {dayList().map(dateStr => {
                  const items = itemsForDay(dateStr)
                  return (
                    <div key={dateStr} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "0.65rem 0.8rem" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: items.length ? "0.4rem" : 0 }}>
                        <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>{fmtDay(dateStr)}</span>
                        {!closed && (
                          <button
                            type="button"
                            onClick={() => onPickSlot?.({ locationId: selectedLocation.id, date: dateStr })}
                            style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--teal)", background: "none",
                              border: "1px solid var(--teal)", borderRadius: 8, padding: "0.25rem 0.6rem", cursor: "pointer" }}
                          >
                            Book this day
                          </button>
                        )}
                      </div>
                      {items.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          {items.map(it => (
                            <div key={it.key} style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
                              {it.kind === "event" ? "📅 " : "🔒 "}{it.label}
                            </div>
                          ))}
                        </div>
                      )}
                      {items.length === 0 && !closed && (
                        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>Nothing booked yet.</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Portal>
    <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </>
  )
}
