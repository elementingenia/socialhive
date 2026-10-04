import assert from "node:assert/strict"
import { busDriverLabel, normaliseBusDriver, BUS_DRIVER_NAME_MAX } from "../../lib/busDriver.js"

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

console.log(`busDriver: ${n} passed`)
