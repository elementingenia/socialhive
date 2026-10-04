import assert from "node:assert/strict"
import {
  normaliseLabel, labelKey, validateLabel, resolveSuggestion,
  validateSelection, buildDirectory, interestsLine, pendingToAlert,
  adminAlertMessage, reviewOutcomeMessage, sortByLabel, groupByInterest,
  KIND, NOTE_MAX, kindOf, normaliseNote, buildSkillNotes,
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
  assert.deepEqual(r, { action: "create", label: "Model trains", kind: "interest" })
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
t("no cap on interests", () => {
  const many = Array.from({ length: 30 }, (_, i) => `t${i}`)
  const m = new Map(many.map(id => [id, { id, label: id, status: "approved" }]))
  assert.equal(validateSelection(many, m, []).ids.length, 30)
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
t("alert singular", () => assert.equal(adminAlertMessage(1, 1), "1 new suggestion to review in Admin › Interests & Skills."))
t("alert plural with total", () => assert.equal(adminAlertMessage(2, 5), "2 new suggestions to review in Admin › Interests & Skills (5 waiting in total)."))

t("outcome approved", () => assert.match(reviewOutcomeMessage("approved", "Ukulele"), /approved/))
t("outcome merged", () => assert.equal(reviewOutcomeMessage("merged", "Veggies", "Gardening"), 'Your interest suggestion "Veggies" was added as "Gardening".'))
t("outcome rejected", () => assert.match(reviewOutcomeMessage("rejected", "X y"), /wasn't added/))
t("outcome unknown", () => assert.equal(reviewOutcomeMessage("other", "a"), null))

t("sortByLabel case-insensitive", () => assert.deepEqual(
  sortByLabel([{ label: "bridge" }, { label: "Art" }, { label: "Cooking" }]).map(r => r.label),
  ["Art", "bridge", "Cooking"]))

t("groupByInterest inverts, A-Z, no empties", () => {
  const g = groupByInterest({ m1: ["Golf", "Bridge"], m2: ["Bridge"], m3: [] })
  assert.deepEqual(g, [{ label: "Bridge", memberIds: ["m1", "m2"] }, { label: "Golf", memberIds: ["m1"] }])
})
t("groupByInterest dedupes a member and tolerates junk", () => {
  const g = groupByInterest({ m1: ["Bridge", "bridge "], m2: null })
  assert.deepEqual(g, [{ label: "Bridge", memberIds: ["m1"] }])
})
t("groupByInterest empty directory", () => assert.deepEqual(groupByInterest(undefined), []))

t("buildDirectory pending mode returns only pending chips, Private still stripped", () => {
  const members = [{ id: "a", status: "active" }, { id: "p", status: "active", hide_name: true }]
  const tags = [{ id: "g", label: "Gardening", status: "approved" }, { id: "c", label: "Cinema", status: "pending" }]
  const links = [{ member_id: "a", tag_id: "g" }, { member_id: "a", tag_id: "c" }, { member_id: "p", tag_id: "c" }]
  assert.deepEqual(buildDirectory(members, links, tags), { a: ["Gardening"] })
  assert.deepEqual(buildDirectory(members, links, tags, "pending"), { a: ["Cinema"] })
})

// ── Skills (B7, migration 124) ──────────────────────────────────────────────
const MIX = [
  { id: "pi", label: "Photography", status: "approved" },                 // pre-124 row: interest
  { id: "ps", label: "Photography", status: "approved", kind: "skill" },
  { id: "hs", label: "Handyman", status: "pending", kind: "skill" },
  { id: "rs", label: "Electrician", status: "retired", kind: "skill" },
]
t("kindOf defaults to interest", () => { assert.equal(kindOf({}), "interest"); assert.equal(kindOf({ kind: "skill" }), "skill") })
t("resolve is per kind: skill picks the skill chip", () => {
  const r = resolveSuggestion("photography", MIX, KIND.SKILL); assert.equal(r.action, "select"); assert.equal(r.tag.id, "ps")
})
t("resolve is per kind: interest picks the interest chip", () => {
  assert.equal(resolveSuggestion("photography", MIX).tag.id, "pi")
})
t("resolve joins a pending skill, not across kinds", () => {
  assert.equal(resolveSuggestion("handyman", MIX, KIND.SKILL).action, "join")
  assert.equal(resolveSuggestion("handyman", MIX, KIND.INTEREST).action, "create")
})
t("retired skill unavailable only for skills", () => {
  assert.equal(resolveSuggestion("electrician", MIX, KIND.SKILL).action, "unavailable")
  assert.equal(resolveSuggestion("electrician", MIX).action, "create")
})
t("new skill carries kind", () => assert.equal(resolveSuggestion("Ukulele lessons", MIX, KIND.SKILL).kind, "skill"))
t("no cap on either list together", () => {
  const rows = [
    ...Array.from({ length: 20 }, (_, i) => ({ id: `i${i}`, label: `I${i}`, status: "approved" })),
    ...Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, label: `S${i}`, status: "approved", kind: "skill" })),
  ]
  const m = new Map(rows.map(r => [r.id, r]))
  assert.equal(validateSelection(rows.map(r => r.id), m, []).ids.length, 40)
})
t("note normalised / blank / too long", () => {
  assert.deepEqual(normaliseNote("  Small  jobs "), { note: "Small jobs" })
  assert.deepEqual(normaliseNote("   "), { note: null })
  assert.deepEqual(normaliseNote(undefined), { note: null })
  assert.ok(normaliseNote("x".repeat(NOTE_MAX + 1)).error)
  assert.ok(normaliseNote(5).error)
})
t("directory splits by kind", () => {
  const members = [{ id: "a", status: "active" }]
  const links = [{ member_id: "a", tag_id: "pi" }, { member_id: "a", tag_id: "ps" }]
  assert.deepEqual(buildDirectory(members, links, MIX), { a: ["Photography"] })
  assert.deepEqual(buildDirectory(members, links, MIX, "approved", "skill"), { a: ["Photography"] })
  assert.deepEqual(buildDirectory(members, [links[0]], MIX, "approved", "skill"), {})
})
t("skill notes: skills only, Private stripped, blanks omitted", () => {
  const members = [{ id: "a", status: "active" }, { id: "p", status: "active", hide_name: true }]
  const links = [
    { member_id: "a", tag_id: "ps", note: "Events only" }, { member_id: "a", tag_id: "pi", note: "ignored" },
    { member_id: "a", tag_id: "hs", note: null }, { member_id: "p", tag_id: "ps", note: "hidden" },
  ]
  assert.deepEqual(buildSkillNotes(members, links, MIX), { a: { Photography: "Events only" } })
})
t("outcome wording for skills", () => assert.equal(reviewOutcomeMessage("rejected", "X y", null, "skill"), 'Your skill suggestion "X y" wasn\'t added to the list.'))

console.log(`interests: ${n} passed`)
