// Personal vehicle offers -- self-service panel (migration 109, Iain
// 2026-09-17). Second, independent transport option alongside Community
// Bus (which stays completely unchanged -- see the 🚌 toggle/riders block
// right above this panel in EventSlideOut.js's BookingSection). Talks to
// app/api/vehicle-offers/route.js, the authoritative check; every gate
// shown here (bus rider, already driving, already a passenger elsewhere)
// mirrors lib/vehicleOffers.js exactly so a resident basically never hits
// the server's own rejection.
//
// Deliberately a self-contained panel rather than threaded through
// BookingSection's own party/seat state -- a car's passengers can come from
// completely different bookings/parties across the whole event (see the
// scope doc's "structural reason this can't just copy Bus's approach"),
// so it has its own small API surface and its own load/refresh cycle.

import { useState, useEffect, useCallback } from "react"
import { authedFetch } from "@/lib/getAuthToken"

// Groups a car's flat passenger list back into booking parties (migration
// 110 follow-up: every passenger row carries a party_key from the API --
// party_owner_member_id/contact_id, or the row's own id when it has no
// party owner) so the panel can show "riding together" rather than a flat
// list that hides who's actually in one booking.
function groupByParty(passengers) {
  const groups = new Map()
  for (const p of passengers) {
    const key = p.party_key || `p:${p.id}`
    if (!groups.has(key)) groups.set(key, { key, members: [] })
    groups.get(key).members.push(p)
  }
  return Array.from(groups.values())
}

function driverLabel(driver) {
  if (!driver) return "Someone"
  if (driver.member_id) return driver.hide_name ? "Resident" : (driver.display_name || driver.name || driver.username || "Resident")
  return driver.name || "Resident"
}

export default function VehicleOffersPanel({ event, meId, showToast }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [seatsInput, setSeatsInput] = useState("0")
  const [savingOffer, setSavingOffer] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [bumpTarget, setBumpTarget] = useState(null) // { passengerId, name } while the reason prompt is open
  const [bumpReason, setBumpReason] = useState("")
  const [withdrawTarget, setWithdrawTarget] = useState(null) // { offerId } while the withdraw-reason form is open
  const [withdrawReason, setWithdrawReason] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authedFetch(`/api/vehicle-offers?event_id=${event.id}`)
      const d = await res.json()
      if (res.ok) {
        setData(d)
        const mine = (d.offers || []).find(o => o.is_own_offer)
        setSeatsInput(mine ? String(mine.seats_offered) : "0")
      }
    } finally {
      setLoading(false)
    }
  }, [event.id])

  useEffect(() => { load() }, [load])

  async function call(action, extra = {}) {
    const res = await authedFetch("/api/vehicle-offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: event.id, action, ...extra }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { showToast(d.error || "Something went wrong", "error"); return false }
    await load()
    return true
  }

  async function saveOffer() {
    setSavingOffer(true)
    try {
      const n = parseInt(seatsInput, 10)
      await call("offer", { seats_offered: Number.isFinite(n) ? n : 0 })
    } finally {
      setSavingOffer(false)
    }
  }

  async function withdraw(offerId, hasPassengers) {
    if (hasPassengers) {
      // No native window.prompt() -- an inline form below (see withdrawTarget)
      // collects the reason instead, matching the app's "no native browser
      // controls" standard (flagged by Iain, live-fire review of PR #145).
      setWithdrawTarget({ offerId })
      setWithdrawReason("")
      return
    }
    setBusyId(offerId)
    await call("withdraw_offer", { vehicle_offer_id: offerId })
    setBusyId(null)
  }

  async function confirmWithdraw() {
    if (!withdrawReason.trim()) { showToast("A reason is needed to notify the passengers", "error"); return }
    setBusyId(withdrawTarget.offerId)
    const ok = await call("withdraw_offer", { vehicle_offer_id: withdrawTarget.offerId, reason: withdrawReason })
    setBusyId(null)
    if (ok) setWithdrawTarget(null)
  }

  async function claimSeat(offerId) {
    setBusyId(offerId)
    await call("claim_seat", { vehicle_offer_id: offerId })
    setBusyId(null)
  }

  async function leaveSeat(passengerId) {
    setBusyId(passengerId)
    await call("leave_seat", { vehicle_offer_passenger_id: passengerId })
    setBusyId(null)
  }

  function startBump(passengerId, name) {
    setBumpTarget({ passengerId, name })
    setBumpReason("")
  }

  async function confirmBump() {
    if (!bumpReason.trim()) { showToast("Please give a reason -- it's sent to them as a notification", "error"); return }
    setBusyId(bumpTarget.passengerId)
    const ok = await call("remove_passenger", { vehicle_offer_passenger_id: bumpTarget.passengerId, reason: bumpReason })
    setBusyId(null)
    if (ok) setBumpTarget(null)
  }

  if (loading || !data) return null
  if (!data.allow_personal_vehicles) return null

  const { offers, my } = data
  const myOffer = offers.find(o => o.is_own_offer)
  const eligibleToDrive = !my.is_driving && my.is_attendee && !my.is_bus_rider && !my.is_passenger_elsewhere
  const eligibleToRide = my.is_attendee && !my.is_driving && !my.is_bus_rider

  return (
    <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.6 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>🚗 Personal vehicles</div>

      {my.is_bus_rider && (
        <div style={{ color: "var(--text-dim)", marginBottom: 6 }}>You're riding the bus for this event, so driving or riding in a car isn't available.</div>
      )}

      {/* Self-nomination / edit own offer */}
      {my.is_driving ? (
        <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
          <div style={{ marginBottom: 6 }}>
            You're driving{myOffer ? ` — offering ${myOffer.seats_offered} seat${myOffer.seats_offered === 1 ? "" : "s"}` : ""}
            {myOffer && myOffer.seats_offered === 0 && " (driving yourself, not offering a ride)"}
          </div>
          {myOffer && myOffer.passengers.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              {groupByParty(myOffer.passengers).map(group => (
                <div key={group.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "2px 0" }}>
                  <span>{group.members.map(p => `${p.name}${p.guest ? " (guest)" : ""}`).join(" + ")}{group.members.length > 1 ? " (one booking)" : ""}</span>
                  <button onClick={() => startBump(group.members[0].id, group.members.map(p => p.name).join(" + "))} disabled={group.members.some(p => busyId === p.id)}
                    style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 11.5, flexShrink: 0, marginLeft: 8 }}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="number" min="0" value={seatsInput} onChange={e => setSeatsInput(e.target.value)}
              style={{ width: 60, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} />
            <button onClick={saveOffer} disabled={savingOffer} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "var(--amber)", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
              Update seats
            </button>
            <button onClick={() => myOffer && withdraw(myOffer.id, myOffer.passengers.length > 0)} disabled={busyId === myOffer?.id}
              style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--danger)", background: "none", color: "var(--danger)", cursor: "pointer" }}>
              Stop offering
            </button>
          </div>
        </div>
      ) : eligibleToDrive ? (
        <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
          <div style={{ marginBottom: 6 }}>Driving yourself? Offer seats to other attendees (or offer 0 if you're just driving yourself).</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="number" min="0" value={seatsInput} onChange={e => setSeatsInput(e.target.value)}
              style={{ width: 60, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} />
            <button onClick={saveOffer} disabled={savingOffer} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "var(--amber)", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
              {savingOffer ? "Saving…" : "Offer to drive"}
            </button>
          </div>
        </div>
      ) : null}

      {/* Open vehicles -- a genuine per-vehicle pick list, not a flat "claim a seat" button */}
      {offers.filter(o => !o.is_own_offer).length > 0 && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Open cars</div>
          {offers.filter(o => !o.is_own_offer).map(o => {
            const myRow = o.passengers.find(p => p.is_me)
            return (
              <div key={o.id} style={{ padding: "4px 0", borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{driverLabel(o.driver)} — {o.seats_remaining}/{o.seats_offered} seat{o.seats_offered === 1 ? "" : "s"} left</span>
                  {myRow ? (
                    <button onClick={() => leaveSeat(myRow.id)} disabled={busyId === myRow.id}
                      style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "none", color: "var(--text)", cursor: "pointer", fontSize: 11.5 }}>
                      Leave seat
                    </button>
                  ) : (
                    eligibleToRide && o.seats_remaining > 0 && (
                      <button onClick={() => claimSeat(o.id)} disabled={busyId === o.id}
                        title="Claiming a seat brings your whole booking party along -- if your booking is for more than one seat, everyone in it rides in this car"
                        style={{ padding: "3px 8px", borderRadius: 6, border: "none", background: "var(--teal)", color: "#fff", cursor: "pointer", fontSize: 11.5 }}>
                        Claim a seat
                      </button>
                    )
                  )}
                </div>
                {!myRow && eligibleToRide && o.seats_remaining > 0 && (
                  <div style={{ color: "var(--text-dim)", fontSize: 11 }}>Your whole booking party comes with you into this car.</div>
                )}
                {o.passengers.length > 0 && (
                  <div style={{ color: "var(--text-dim)", fontSize: 11.5 }}>
                    Riding: {groupByParty(o.passengers).map(g => g.members.map(p => `${p.name}${p.guest ? " (guest)" : ""}`).join(" + ")).join(", ")}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {bumpTarget && (
        <div style={{ marginTop: 10, padding: 8, borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div style={{ marginBottom: 6 }}>Remove {bumpTarget.name} from your car — they'll be notified with your reason:</div>
          <textarea value={bumpReason} onChange={e => setBumpReason(e.target.value)} rows={2}
            style={{ width: "100%", boxSizing: "border-box", padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", marginBottom: 6 }}
            placeholder="e.g. Need the seat for a family member instead" />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={confirmBump} disabled={busyId === bumpTarget.passengerId}
              style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "var(--danger)", color: "#fff", cursor: "pointer" }}>
              Remove & notify
            </button>
            <button onClick={() => setBumpTarget(null)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "none", color: "var(--text)", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {withdrawTarget && (
        <div style={{ marginTop: 10, padding: 8, borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div style={{ marginBottom: 6 }}>This car has passengers already seated — give them a reason for the car no longer being available:</div>
          <textarea value={withdrawReason} onChange={e => setWithdrawReason(e.target.value)} rows={2}
            style={{ width: "100%", boxSizing: "border-box", padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", marginBottom: 6 }}
            placeholder="e.g. My plans changed and I won't be driving after all" />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={confirmWithdraw} disabled={busyId === withdrawTarget.offerId}
              style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "var(--danger)", color: "#fff", cursor: "pointer" }}>
              Stop offering & notify
            </button>
            <button onClick={() => setWithdrawTarget(null)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "none", color: "var(--text)", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
