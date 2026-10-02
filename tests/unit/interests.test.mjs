import assert from "node:assert/strict"
import {
  MAX_INTERESTS, normaliseLabel, labelKey, validateLabel, resolveSuggestion,
  validateSelection, buildDirectory, interestsLine, pendingToAlert,
  adminAlertMessage, reviewOutcomeMessage, sortByLabel,
} from "../../lib/interests.js"

let n = 0
const t = (name, fn) => { try { fn(); n++ } catch (e) { console.error("FAIL:", name); throw e } }

const TAGS = [
  { id: "g", label: "Gardening", status: "approved" },
  { id: "b", label: "Bridge", status: "approved" },
  { id: "p", label: "Pickleball", status: "pending" },
  { id: "r", label: "Darts", status: "rejected" },
  { id: "x", label: "Golf", status: "retired" },
]

t("normalise trims and collapses", () => assert.equal(normaliseLabel("  Model   trains "), "Model trains"))
t("normalise non-string", () => assert.equal(normaliseLabel(null), ""))
t("key is case-insensitive", () => assert.equal(labelKey(" GARDENING "), "gardening"))

t("too short", () => assert.ok(validateLabel("a")))
t("too long", () => assert.ok(validateLabel("x".repeat(41))))
t("digits only refused", () => assert.ok(validateLabel("1234")))
t("ok label", () => assert.equal(validateLabel("Ukulele"), null))
t("accented letters ok", () => assert.equal(validateLabel("Pétanque"), null))

t("matches approved -> select", () => {
  const r = resolveSuggestion("  gardening", TAGS)
  assert.equal(r.action, "select"); assert.equal(r.tag.id, "g")
})
t("matches pending -> join", () => {
  const r = resolveSuggestion("PICKLEBALL", TAGS)
  assert.equal(r.action, "join"); assert.equal(r.tag.id, "p")
})
t("rejected label -> create new", () => assert.equal(resolveSuggestion("darts", TAGS).action, "create"))
t("retired label -> unavailable (not a new pending)", () => {
  const r = resolveSuggestion(" GOLF ", TAGS)
  assert.equal(r.action, "unavailable"); assert.equal(r.tag.id, "x"); assert.ok(r.error)
})
t("approved beats retired if both somehow match", () => {
  const r = resolveSuggestion("golf", [...TAGS, { id: "g2", label: "Golf", status: "approved" }])
  assert.equal(r.action, "select"); assert.equal(r.tag.id, "g2")
})
t("new label normalised", () => {
  const r = resolveSuggestion(" Model  trains ", TAGS)
  assert.deepEqual(r, { action: "create", label: "Model trains" })
})
t("invalid -> error", () => assert.equal(resolveSuggestion("!", TAGS).action, "error"))

const byId = new Map(TAGS.map(x => [x.id, x]))
t("selection approved ok", () => assert.deepEqual(validateSelection(["g", "b"], byId, []).ids, ["g", "b"]))
t("selection dedupes", () => assert.deepEqual(validateSelection(["g", "g"], byId, []).ids, ["g"]))
t("pending ok only if already linked", () => {
  assert.ok(validateSelection(["p"], byId, []).error)
  assert.deepEqual(validateSelection(["p"], byId, ["p"]).ids, ["p"])
})
t("retired refused", () => assert.ok(validateSelection(["x"], byId, ["x"]).error))
t("rejected refused", () => assert.ok(validateSelection(["r"], byId, ["r"]).error))
t("unknown refused", () => assert.ok(validateSelection(["zz"], byId, []).error))
t("cap enforced", () => {
  const many = Array.from({ length: MAX_INTERESTS + 1 }, (_, i) => `t${i}`)
  const m = new Map(many.map(id => [id, { id, label: id, status: "approved" }]))
  assert.ok(validateSelection(many, m, []).error)
  assert.equal(validateSelection(many.slice(0, MAX_INTERESTS), m, []).ids.length, MAX_INTERESTS)
})
t("non-array refused", () => assert.ok(validateSelection("g", byId, []).error))
t("plain object map works", () => assert.deepEqual(validateSelection(["g"], { g: TAGS[0] }, []).ids, ["g"]))

t("directory excludes private, test, inactive, unapproved", () => {
  const members = [
    { id: "m1", status: "active" },
    { id: "m2", status: "active", hide_name: true },
    { id: "m3", status: "active", is_test: true },
    { id: "m4", status: "inactive" },
  ]
  const links = [
    { member_id: "m1", tag_id: "g" }, { member_id: "m1", tag_id: "b" },
    { member_id: "m1", tag_id: "p" }, { member_id: "m1", tag_id: "x" },
    { member_id: "m2", tag_id: "g" }, { member_id: "m3", tag_id: "g" }, { member_id: "m4", tag_id: "g" },
  ]
  assert.deepEqual(buildDirectory(members, links, TAGS), { m1: ["Bridge", "Gardening"] })
})
t("directory empty inputs", () => assert.deepEqual(buildDirectory(null, null, null), {}))

t("line", () => assert.equal(interestsLine(["Bridge", "Golf"]), "Bridge, Golf"))
t("line empty", () => assert.equal(interestsLine([]), ""))

t("pendingToAlert", () => {
  const rows = [
    { id: 1, status: "pending" },
    { id: 2, status: "pending", admin_alerted_at: "2026-10-01T00:00:00Z" },
    { id: 3, status: "approved" },
  ]
  assert.deepEqual(pendingToAlert(rows).map(r => r.id), [1])
})
t("alert none", () => assert.equal(adminAlertMessage(0, 3), null))
t("alert singular", () => assert.equal(adminAlertMessage(1, 1), "1 new interest suggestion to review in Admin › Interests."))
t("alert plural with total", () => assert.equal(adminAlertMessage(2, 5), "2 new interest suggestions to review in Admin › Interests (5 waiting in total)."))

t("outcome approved", () => assert.match(reviewOutcomeMessage("approved", "Ukulele"), /approved/))
t("outcome merged", () => assert.equal(reviewOutcomeMessage("merged", "Veggies", "Gardening"), 'Your interest suggestion "Veggies" was added as "Gardening".'))
t("outcome rejected", () => assert.match(reviewOutcomeMessage("rejected", "X y"), /wasn't added/))
t("outcome unknown", () => assert.equal(reviewOutcomeMessage("other", "a"), null))

t("sortByLabel case-insensitive", () => assert.deepEqual(
  sortByLabel([{ label: "bridge" }, { label: "Art" }, { label: "Cooking" }]).map(r => r.label),
  ["Art", "bridge", "Cooking"]))

console.log(`interests: ${n} passed`)
