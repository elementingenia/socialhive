"use client"
import { useState, useEffect } from "react"
import { HUB_COLOURS } from "@/lib/navUtils"
import { supabase } from "@/lib/supabase"

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return ""
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })
}

function fmtTime(t) {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  const ampm = h >= 12 ? "pm" : "am"
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${ampm}`
}

function fmtCost(cost) {
  if (!cost || cost === 0) return "Free to attend"
  return `$${parseFloat(cost).toFixed(2)}`
}

function CapacityBar({ booked, max, waitlist }) {
  const pct = max > 0 ? Math.min(100, (booked / max) * 100) : 0
  const left = Math.max(0, max - booked)
  const colour = pct >= 85 ? "var(--danger)" : pct >= 55 ? "var(--amber)" : "var(--green)"
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ height: 8, background: "var(--surface2)", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: colour, borderRadius: 4, transition: "width 0.4s ease", minWidth: pct > 0 ? 6 : 0 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-dim)" }}>
        <span>{booked}/{max} seats taken{waitlist > 0 && ` · ${waitlist} waiting`}</span>
        <span style={{ color: left === 0 ? "var(--danger)" : colour, fontWeight: 600 }}>
          {left === 0 ? "Full" : `${left} left`}
        </span>
      </div>
    </div>
  )
}

function SeatSelector({ value, min, max, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Seats:</span>
      <div style={{ display: "flex", alignItems: "center", gap: 0, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          style={{ width: 44, height: 44, border: "none", background: "var(--surface2)", fontSize: 20, cursor: value <= min ? "default" : "pointer", color: value <= min ? "#ccc" : "var(--text)", fontWeight: 700 }}
        >−</button>
        <span style={{ minWidth: 40, textAlign: "center", fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          style={{ width: 44, height: 44, border: "none", background: "var(--surface2)", fontSize: 20, cursor: value >= max ? "default" : "pointer", color: value >= max ? "#ccc" : "var(--text)", fontWeight: 700 }}
        >+</button>
      </div>
    </div>
  )
}

function StatusPill({ label, colour, bg }) {
  return (
    <div style={{
      display: "inline-block",
      padding: "6px 16px",
      background: bg || colour + "20",
      color: colour,
      borderRadius: 20,
      fontSize: 13,
      fontWeight: 700,
      border: `1px solid ${colour}`,
    }}>{label}</div>
  )
}

function Toast({ msg, type }) {
  if (!msg) return null
  const bg = type === "error" ? "var(--danger)" : type === "warn" ? "var(--amber-dark)" : "#15803d"
  return (
    <div style={{
      position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, background: bg, color: "#fff",
      padding: "10px 20px", borderRadius: 12, fontSize: 14, fontWeight: 600,
      boxShadow: "0 4px 20px rgba(0,0,0,0.2)", whiteSpace: "nowrap",
    }}>{msg}</div>
  )
}

function ConfirmDialog({ message, onConfirm, onCancel, paymentNote }) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 320 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Are you sure?</div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: paymentNote ? 8 : 20, lineHeight: 1.5 }}>{message}</div>
        {paymentNote && (
          <div style={{ fontSize: 12, color: "var(--amber-dark)", background: "var(--amber-light)", padding: "8px 12px", borderRadius: 8, marginBottom: 16, lineHeight: 1.5 }}>
            ⚠️ {paymentNote}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "11px 0", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--text)" }}>Keep it</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: "11px 0", background: "var(--danger)", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#fff" }}>Yes, cancel</button>
        </div>
      </div>
    </div>
  )
}

function SplitDialog({ offer, onAccept, onDecline }) {
  return (
    <div onClick={onDecline} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 340 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Not quite enough seats</div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16, lineHeight: 1.5 }}>
          Only <strong>{offer.confirmed}</strong> seat{offer.confirmed !== 1 ? "s" : ""} available right now.
          We can confirm {offer.confirmed} and add {offer.waitlisted} to the waitlist.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onDecline} style={{ flex: 1, padding: "11px 0", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--text)" }}>No thanks</button>
          <button onClick={onAccept} style={{ flex: 1, padding: "11px 0", background: "var(--amber)", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#fff" }}>Accept split</button>
        </div>
      </div>
    </div>
  )
}

// ── Booking Form ──────────────────────────────────────────────────────────────
function BookingSection({ event, onRefresh }) {
  const [seats, setSeats] = useState(1)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [splitOffer, setSplitOffer] = useState(null)

  const myConfirmed = event.my_bookings?.find(b => b.status === "confirmed")
  const myWaitlist  = event.my_bookings?.find(b => b.status === "waitlist")
  const booked = event.bookings_count || 0
  const max = event.max_seats || 0
  const maxPerBooking = event.max_seats_per_booking || 4
  const availableSeats = Math.max(0, max - booked)

  // Initialise modify seat count from current booking
  const [modifySeats, setModifySeats] = useState(
    (myConfirmed?.seats || 0) + (myWaitlist?.seats || 0) || 1
  )
  const [modifying, setModifying] = useState(false)

  function showToast(msg, type = "success") {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  async function handleBook(acceptSplit = false) {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ event_id: event.id, seats, accept_split: acceptSplit }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || "Booking failed", "error"); return }

      if (data.status === "split_offer") {
        setSplitOffer(data)
        return
      }
      if (data.status === "confirmed") showToast(`Booked — ${data.seats} seat${data.seats !== 1 ? "s" : ""} confirmed!`)
      else if (data.status === "waitlist") showToast("Added to waitlist", "warn")
      else if (data.status === "split_confirmed") showToast(`${data.confirmed} confirmed + ${data.waitlisted} waitlisted`, "warn")
      onRefresh()
    } finally {
      setLoading(false)
      setSplitOffer(null)
    }
  }

  async function handleModify() {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ event_id: event.id, seats: modifySeats }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || "Update failed", "error"); return }
      showToast("Booking updated")
      setModifying(false)
      onRefresh()
    } finally { setLoading(false) }
  }

  async function handleCancel() {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch("/api/bookings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ event_id: event.id }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || "Cancel failed", "error"); return }
      showToast("Booking cancelled")
      setConfirm(false)
      onRefresh()
    } finally { setLoading(false) }
  }

  const isBookclubEvent = event.hub_type === "bookclub"

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      {confirm && (
        <ConfirmDialog
          message="This will cancel your booking for this event."
          paymentNote={event.payment_required ? "If you paid, please contact the Event Coordinator to arrange a refund." : null}
          onConfirm={handleCancel}
          onCancel={() => setConfirm(false)}
        />
      )}
      {splitOffer && (
        <SplitDialog
          offer={splitOffer}
          onAccept={() => handleBook(true)}
          onDecline={() => setSplitOffer(null)}
        />
      )}

      <CapacityBar booked={booked} max={max} waitlist={event.waitlist_count || 0} />

      {/* No existing booking — show booking form */}
      {!myConfirmed && !myWaitlist && (
        <div>
          {!isBookclubEvent && availableSeats > 0 && (
            <SeatSelector
              value={seats}
              min={1}
              max={Math.min(maxPerBooking, availableSeats)}
              onChange={setSeats}
            />
          )}
          <button
            onClick={() => handleBook()}
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px 0",
              background: "var(--amber)",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Booking…" : isBookclubEvent ? "Sign Up" : availableSeats === 0 ? "Join Waitlist" : "Book Now"}
          </button>
          {event.payment_required && (
            <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", marginTop: 8 }}>
              Payment required to confirm your booking. The coordinator will be in touch.
            </div>
          )}
        </div>
      )}

      {/* Has existing booking */}
      {(myConfirmed || myWaitlist) && !modifying && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Status pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
            {myConfirmed && (
              <StatusPill
                label={
                  event.payment_required
                    ? (myConfirmed.payment_status === "confirmed" ? "✓ Payment Confirmed" : "⏳ Pending Payment")
                    : `✓ ${myConfirmed.seats} seat${myConfirmed.seats !== 1 ? "s" : ""} confirmed`
                }
                colour={myConfirmed.payment_status === "confirmed" || !event.payment_required ? "var(--green)" : "var(--amber-dark)"}
              />
            )}
            {myWaitlist && (
              <StatusPill
                label={`⏳ ${myWaitlist.seats} on waitlist`}
                colour="var(--amber-dark)"
              />
            )}
          </div>

          {/* Modify / Cancel */}
          {myConfirmed && !isBookclubEvent && (
            <button
              onClick={() => { setModifySeats((myConfirmed.seats || 1) + (myWaitlist?.seats || 0)); setModifying(true) }}
              style={{ width: "100%", padding: "12px 0", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--text)" }}
            >Modify Seats</button>
          )}
          <button
            onClick={() => setConfirm(true)}
            style={{ width: "100%", padding: "12px 0", background: "transparent", border: "1px solid var(--danger)", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--danger)" }}
          >Cancel Booking</button>
        </div>
      )}

      {/* Modify mode */}
      {modifying && (
        <div>
          <SeatSelector
            value={modifySeats}
            min={1}
            max={maxPerBooking}
            onChange={setModifySeats}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setModifying(false)}
              style={{ flex: 1, padding: "12px 0", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--text)" }}
            >Cancel</button>
            <button
              onClick={handleModify}
              disabled={loading}
              style={{ flex: 1, padding: "12px 0", background: "var(--amber)", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", color: "#fff", opacity: loading ? 0.7 : 1 }}
            >{loading ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Login Prompt (for public calendar) ───────────────────────────────────────
function LoginPrompt() {
  return (
    <div style={{
      background: "var(--amber-light)",
      borderRadius: 12,
      padding: 20,
      textAlign: "center",
      border: "1px solid var(--amber)",
    }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 6 }}>
        Login to book
      </div>
      <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 16 }}>
        Residents of Fullerton Cove can register and book events.
      </div>
      <a
        href="/login"
        style={{
          display: "block",
          padding: "12px 0",
          background: "var(--amber)",
          color: "#fff",
          borderRadius: 10,
          fontWeight: 700,
          fontSize: 15,
          textDecoration: "none",
        }}
      >Sign In</a>
      <a
        href="/login?register=1"
        style={{
          display: "block",
          marginTop: 8,
          padding: "11px 0",
          background: "transparent",
          color: "var(--amber-dark)",
          borderRadius: 10,
          fontWeight: 600,
          fontSize: 14,
          textDecoration: "none",
          border: "1px solid var(--amber)",
        }}
      >Register as a Resident</a>
    </div>
  )
}

// ── EventSlideOut (main export) ───────────────────────────────────────────────
export default function EventSlideOut({ event, onClose, isAuthenticated = true, onRefresh }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (event) {
      // Slight delay so CSS transition fires
      requestAnimationFrame(() => setOpen(true))
    } else {
      setOpen(false)
    }
  }, [event])

  if (!event) return null

  const colour = event.is_public === false ? "#bbb" : (HUB_COLOURS[event.hub_type] || "var(--amber)")
  const isPrivate = event.is_public === false

  function handleClose() {
    setOpen(false)
    setTimeout(onClose, 280)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          zIndex: 300,
          opacity: open ? 1 : 0,
          transition: "opacity 0.25s ease",
        }}
      />

      {/* Panel */}
      <div style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(420px, 96vw)",
        background: "var(--surface)",
        zIndex: 301,
        overflowY: "auto",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.15)",
        paddingBottom: 32,
      }}>

        {/* Colour bar + close */}
        <div style={{
          height: 6,
          background: colour,
        }} />
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          background: "var(--surface)",
          zIndex: 1,
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: colour, textTransform: "capitalize" }}>
            {event.hub_type === "bookclub" ? "Book Club" : event.hub_type}
          </div>
          <button onClick={handleClose} style={{
            background: "var(--surface2)",
            border: "none",
            borderRadius: "50%",
            width: 36, height: 36,
            fontSize: 20, cursor: "pointer", color: "var(--text)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        <div style={{ padding: "16px 16px 0" }}>

          {/* Movie poster / Book cover */}
          {event.hub_type === "movie" && event.movie?.poster_url && (
            <img
              src={event.movie.poster_url}
              alt={event.movie.title}
              style={{
                width: "100%",
                maxHeight: 260,
                objectFit: "cover",
                borderRadius: 12,
                marginBottom: 14,
              }}
            />
          )}
          {event.hub_type === "bookclub" && event.book?.cover_url && (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <img
                src={event.book.cover_url}
                alt={event.book.title}
                style={{ height: 160, borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}
              />
            </div>
          )}

          {/* Title */}
          <h2 style={{
            fontSize: 20,
            fontWeight: 800,
            color: "var(--text)",
            marginBottom: 4,
            lineHeight: 1.3,
            fontStyle: isPrivate ? "italic" : "normal",
            color: isPrivate ? "#888" : "var(--text)",
          }}>
            {isPrivate ? "Residents Only" : event.title}
          </h2>

          {/* Date/time */}
          <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 12, fontWeight: 500 }}>
            📅 {fmtDate(event.event_date)} at {fmtTime(event.event_time)}
          </div>

          {/* Private event message */}
          {isPrivate && (
            <div style={{
              background: "#f5f5f5",
              borderRadius: 10,
              padding: 14,
              fontSize: 13,
              color: "#888",
              lineHeight: 1.5,
              marginBottom: 12,
            }}>
              This is a residents-only event. Login to see full details and book your place.
            </div>
          )}

          {/* Only show details for public events */}
          {!isPrivate && (
            <>
              {/* Movie-specific: ratings */}
              {event.hub_type === "movie" && event.movie && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                    {event.movie.rating_imdb && event.movie.imdb_id && (
                      <a
                        href={`https://www.imdb.com/title/${event.movie.imdb_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#f5c518", fontWeight: 800, textDecoration: "none", fontSize: 14 }}
                      >⭐ IMDb {event.movie.rating_imdb}</a>
                    )}
                    {event.movie.genre && (
                      <span style={{ fontSize: 12, color: "var(--text-dim)", background: "var(--surface2)", padding: "2px 8px", borderRadius: 4 }}>
                        {event.movie.genre?.split(",")[0]}
                      </span>
                    )}
                    {event.movie.runtime && (
                      <span style={{ fontSize: 12, color: "var(--text-dim)" }}>⏱ {event.movie.runtime}</span>
                    )}
                  </div>
                  {event.movie.plot && (
                    <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, margin: 0 }}>
                      {event.movie.plot}
                    </p>
                  )}
                </div>
              )}

              {/* Book-specific: rating + summary */}
              {event.hub_type === "bookclub" && event.book && (
                <div style={{ marginBottom: 14 }}>
                  {event.book.author && (
                    <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 6 }}>by {event.book.author}</div>
                  )}
                  {event.book.rating && event.book.rating_link && (
                    <a
                      href={event.book.rating_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#4285f4", fontWeight: 700, textDecoration: "none", fontSize: 14, display: "block", marginBottom: 8 }}
                    >⭐ {event.book.rating} on Google Books</a>
                  )}
                  {event.book.summary && (
                    <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, margin: 0 }}>
                      {event.book.summary}
                    </p>
                  )}
                </div>
              )}

              {/* Social/Outings: description, cost, coordinator */}
              {(event.hub_type === "social" || event.hub_type === "outings") && (
                <div style={{ marginBottom: 14 }}>
                  {event.coordinator?.name && (
                    <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 6 }}>
                      👤 Coordinator: <strong>{event.coordinator.name}</strong>
                    </div>
                  )}
                  <div style={{
                    display: "inline-block",
                    padding: "4px 12px",
                    background: event.cost > 0 ? "var(--amber-light)" : "var(--green-light, #dcfce7)",
                    color: event.cost > 0 ? "var(--amber-dark)" : "#15803d",
                    borderRadius: 20,
                    fontSize: 14,
                    fontWeight: 700,
                    marginBottom: 10,
                  }}>
                    {fmtCost(event.cost)}
                  </div>
                  {event.description && (
                    <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, margin: "8px 0 0" }}>
                      {event.description}
                    </p>
                  )}
                </div>
              )}

              {/* Welcome message */}
              {event.welcome_message && (
                <div style={{
                  background: colour + "10",
                  borderLeft: `3px solid ${colour}`,
                  borderRadius: "0 8px 8px 0",
                  padding: "10px 12px",
                  fontSize: 13,
                  color: "var(--text)",
                  lineHeight: 1.5,
                  marginBottom: 14,
                }}>
                  {event.welcome_message}
                </div>
              )}

              {/* Booking section */}
              <div style={{
                borderTop: "1px solid var(--border)",
                paddingTop: 16,
                marginTop: 4,
              }}>
                {isAuthenticated ? (
                  <BookingSection event={event} onRefresh={onRefresh} />
                ) : (
                  <LoginPrompt />
                )}
              </div>
            </>
          )}

          {/* Private event — login prompt */}
          {isPrivate && !isAuthenticated && (
            <div style={{ marginTop: 8 }}>
              <LoginPrompt />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
