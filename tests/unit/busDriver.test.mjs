import assert from "node:assert/strict"
import { busDriverLabel, normaliseBusDriver, BUS_DRIVER_NAME_MAX, residentBusDriverId, isResidentBusDriver, stripDriverFromBus, planBusDriverSeat } from "../../lib/busDriver.js"

let n = 0
function t(name, fn) { fn(); n++; }

t("label: none", () => assert.equal(busDriverLabel({}), null))
t("label: null event", () => assert.equal(busDriverLabel(null), null))
t("label: resident name", () => assert.equal(busDriverLabel({ bus_driver: { name: "Jo Bloggs" } }), "Jo Bloggs"))
t("label: resident display_name preferred", () => assert.equal(busDriverLabel({ bus_driver: { name: "Jo Bloggs", display_name: "Jo" } }), "Jo"))
t("label: resident username fallback", () => assert.equal(busDriverLabel({ bus_driver: { username: "JoB" } }), "JoB"))
t("label: other name", () => assert.equal(busDriverLabel({ bus_driver_name: "  Holly (Community Manager) " }), "Holly (Community Manager)"))
t("label: blank other", () => assert.equal(busDriverLabel({ bus_driver_name: "   " }), null))
t("label: resident wins over other", () => assert.equal(busDriverLabel({ bus_driver: { name: "Jo" }, bus_driver_name: "Holly" }), "Jo"))

t("norm: bus off clears both", () => assert.deepEqual(normaliseBusDriver({ has_bus: false, bus_driver_id: "x", bus_driver_name: "y" }), { bus_driver_id: null, bus_driver_name: null }))
t("norm: resident", () => assert.deepEqual(normaliseBusDriver({ has_bus: true, bus_driver_id: "x" }), { bus_driver_id: "x", bus_driver_name: null }))
t("norm: resident wins over name", () => assert.deepEqual(normaliseBusDriver({ has_bus: true, bus_driver_id: "x", bus_driver_name: "Holly" }), { bus_driver_id: "x", bus_driver_name: null }))
t("norm: other trimmed", () => assert.deepEqual(normaliseBusDriver({ has_bus: true, bus_driver_name: "  Holly  " }), { bus_driver_id: null, bus_driver_name: "Holly" }))
t("norm: blank other -> null", () => assert.deepEqual(normaliseBusDriver({ has_bus: true, bus_driver_name: "  " }), { bus_driver_id: null, bus_driver_name: null }))
t("norm: non-string name ignored", () => assert.deepEqual(normaliseBusDriver({ has_bus: true, bus_driver_name: 42 }), { bus_driver_id: null, bus_driver_name: null }))
t("norm: length capped", () => assert.equal(normaliseBusDriver({ has_bus: true, bus_driver_name: "a".repeat(200) }).bus_driver_name.length, BUS_DRIVER_NAME_MAX))
t("norm: no args", () => assert.deepEqual(normaliseBusDriver(), { bus_driver_id: null, bus_driver_name: null }))

// ── Resident driver seat (2026-10-29) ──
const ev = { has_bus: true, bus_driver_id: "d" }
t("driver id: bus off", () => assert.equal(residentBusDriverId({ has_bus: false, bus_driver_id: "d" }), null))
t("driver id: other driver", () => assert.equal(residentBusDriverId({ has_bus: true, bus_driver_name: "Holly" }), null))
t("is driver", () => assert.equal(isResidentBusDriver(ev, "d"), true))
t("is not driver", () => assert.equal(isResidentBusDriver(ev, "x"), false))
t("strip: driver off bus, others kept", () => assert.deepEqual(
  stripDriverFromBus([{ member_id: "d", is_bus_passenger: true }, { member_id: "x", is_bus_passenger: true }], "d"),
  [{ member_id: "d", is_bus_passenger: false }, { member_id: "x", is_bus_passenger: true }]))
t("strip: no driver unchanged", () => assert.deepEqual(stripDriverFromBus([{ member_id: "d", is_bus_passenger: true }], null), [{ member_id: "d", is_bus_passenger: true }]))
t("plan: no driver", () => assert.equal(planBusDriverSeat({ event: { has_bus: true } }).action, "none"))
t("plan: open event", () => assert.equal(planBusDriverSeat({ event: { ...ev, booking_required: false } }).action, "none"))
t("plan: archived", () => assert.equal(planBusDriverSeat({ event: { ...ev, archived: true } }).action, "none"))
t("plan: create", () => assert.deepEqual(planBusDriverSeat({ event: ev }), { action: "create", driverId: "d" }))
t("plan: keep own confirmed", () => assert.equal(planBusDriverSeat({ event: ev, bookings: [{ id: "b", status: "confirmed" }] }).bookingId, "b"))
t("plan: confirmed beats waitlist", () => assert.equal(planBusDriverSeat({ event: ev, bookings: [{ id: "w", status: "waitlist" }, { id: "b", status: "confirmed" }] }).action, "keep_own"))
t("plan: cancelled ignored -> create", () => assert.equal(planBusDriverSeat({ event: ev, bookings: [{ id: "b", status: "cancelled" }] }).action, "create"))
t("plan: named on confirmed party", () => assert.equal(planBusDriverSeat({ event: ev, namedRows: [{ id: "a", owner_id: "o" }], confirmedOwnerKeys: new Set(["m:o"]) }).action, "keep_named"))
t("plan: named on contact party", () => assert.equal(planBusDriverSeat({ event: ev, namedRows: [{ id: "a", owner_id: null, owner_contact_id: "c" }], confirmedOwnerKeys: new Set(["c:c"]) }).action, "keep_named"))
t("plan: named on waitlist-only party -> create", () => assert.equal(planBusDriverSeat({ event: ev, namedRows: [{ id: "a", owner_id: "o" }], confirmedOwnerKeys: new Set() }).action, "create"))
t("plan: waitlist promoted", () => assert.deepEqual(planBusDriverSeat({ event: ev, bookings: [{ id: "w", status: "waitlist", seats: 3 }] }), { action: "promote_waitlist", driverId: "d", bookingId: "w", seats: 3 }))

console.log(`busDriver: ${n} passed`)
