// Unit tests for lib/address.js -- house numbers + street names (migration 122).
//   npm run test:unit
import assert from "node:assert/strict"
import {
  normaliseHouseNumber, houseNumberInput, normaliseStreetName, streetKey,
  validateStreetName, sortStreets, formatAddress, resolveStreetId, HOUSE_NUMBER_ERROR,
} from "../../lib/address.js"

let n = 0
const t = (name, fn) => { try { fn(); n++ } catch (e) { console.error("FAIL:", name); throw e } }

// house numbers
t("plain number", () => assert.deepEqual(normaliseHouseNumber("92"), { ok: true, value: "92" }))
t("number type", () => assert.deepEqual(normaliseHouseNumber(14), { ok: true, value: "14" }))
t("trims spaces", () => assert.deepEqual(normaliseHouseNumber("  7 "), { ok: true, value: "7" }))
t("blank -> null", () => assert.deepEqual(normaliseHouseNumber("   "), { ok: true, value: null }))
t("null -> null", () => assert.deepEqual(normaliseHouseNumber(null), { ok: true, value: null }))
t("undefined -> null", () => assert.deepEqual(normaliseHouseNumber(undefined), { ok: true, value: null }))
t("the real bad value is rejected", () => assert.deepEqual(normaliseHouseNumber("92 Mosaic"), { ok: false, error: HOUSE_NUMBER_ERROR }))
t("letters rejected", () => assert.equal(normaliseHouseNumber("12A").ok, false))
t("hash rejected", () => assert.equal(normaliseHouseNumber("#12").ok, false))
t("negative rejected", () => assert.equal(normaliseHouseNumber("-3").ok, false))
t("decimal rejected", () => assert.equal(normaliseHouseNumber("1.5").ok, false))
t("leading zeros dropped", () => assert.deepEqual(normaliseHouseNumber("007"), { ok: true, value: "7" }))
t("zero rejected", () => assert.equal(normaliseHouseNumber("000").ok, false))
t("no upper limit below 6 digits", () => assert.deepEqual(normaliseHouseNumber("999999"), { ok: true, value: "999999" }))
t("7 digits rejected (matches DB check)", () => assert.equal(normaliseHouseNumber("1234567").ok, false))
t("result matches the DB CHECK", () => {
  for (const v of ["1", "92", "122", "4500", "999999"]) assert.match(normaliseHouseNumber(v).value, /^[1-9][0-9]{0,5}$/)
})

// typing filter
t("input strips non-digits", () => assert.equal(houseNumberInput("92 Mosaic"), "92"))
t("input caps length", () => assert.equal(houseNumberInput("12345678"), "123456"))
t("input null", () => assert.equal(houseNumberInput(null), ""))

// street names
t("normalise collapses spaces", () => assert.equal(normaliseStreetName("  Mosaic   Street "), "Mosaic Street"))
t("key ignores case/spacing", () => assert.equal(streetKey(" mosaic  STREET"), streetKey("Mosaic Street")))
t("too short", () => assert.ok(validateStreetName("A")))
t("blank", () => assert.ok(validateStreetName("   ")))
t("too long", () => assert.ok(validateStreetName("x".repeat(61))))
t("ok", () => assert.equal(validateStreetName("Mosaic Street"), null))
t("non-string", () => assert.ok(validateStreetName(null)))
t("sort A-Z ignoring case", () => assert.deepEqual(
  sortStreets([{ name: "mosaic" }, { name: "Banksia" }, { name: "Acacia" }]).map(s => s.name),
  ["Acacia", "Banksia", "mosaic"]))
t("sort does not mutate", () => { const a = [{ name: "b" }, { name: "a" }]; sortStreets(a); assert.equal(a[0].name, "b") })

// formatting
t("number + street", () => assert.equal(formatAddress("92", "Mosaic Street"), "92 Mosaic Street"))
t("number only", () => assert.equal(formatAddress("92", null), "#92"))
t("street only", () => assert.equal(formatAddress(null, "Mosaic Street"), "Mosaic Street"))
t("neither", () => assert.equal(formatAddress(null, ""), ""))

// street id check
const STREETS = [{ id: "s1", name: "Mosaic Street" }, { id: "s2", name: "Banksia Way" }]
t("blank clears", () => assert.deepEqual(resolveStreetId("", STREETS), { ok: true, value: null }))
t("null clears", () => assert.deepEqual(resolveStreetId(null, STREETS), { ok: true, value: null }))
t("known id", () => assert.deepEqual(resolveStreetId("s2", STREETS), { ok: true, value: "s2" }))
t("unknown id rejected (can't type your own)", () => assert.equal(resolveStreetId("Mosaic", STREETS).ok, false))

console.log(`address: ${n} passed`)
