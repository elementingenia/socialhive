import assert from "node:assert/strict"
import {
  STATUS, DEFAULT_THRESHOLD, EXPIRY_DAYS, normaliseText, nameKey, validateProposal, duplicateMessage,
  parseThreshold, validateThreshold, expiresAt, isExpired, daysLeft, isReady, shouldAlertThreshold,
  visibleToResident, adminBucket, closedLabel, slugify, uniqueSlug, countLine,
  declinedMessage, clubCreatedMessage,
} from "../../lib/groupProposals.js"

let n = 0
const t = (name, fn) => { try { fn(); n++ } catch (e) { console.error("FAIL:", name); throw e } }

const NOW = new Date("2026-10-04T00:00:00Z")
const daysAgo = d => new Date(NOW.getTime() - d * 86400000).toISOString()
const live = (d, extra = {}) => ({ id: "p1", name: "Morning Walkers", status: STATUS.LIVE, live_at: daysAgo(d), ...extra })

t("normaliseText trims and collapses spaces", () => assert.equal(normaliseText("  Morning   Walkers "), "Morning Walkers"))
t("nameKey is case-insensitive", () => assert.equal(nameKey(" morning WALKERS"), nameKey("Morning Walkers")))

t("validateProposal accepts a normal name", () => assert.equal(validateProposal({ name: "Ukulele Group" }), null))
t("validateProposal rejects a short name", () => assert.match(validateProposal({ name: "Uk" }), /at least 3/))
t("validateProposal rejects a long name", () => assert.match(validateProposal({ name: "x".repeat(61) }), /60/))
t("validateProposal rejects numbers only", () => assert.match(validateProposal({ name: "123" }), /words/))
t("validateProposal rejects a long description", () => assert.match(validateProposal({ name: "Walkers", description: "x".repeat(501) }), /500/))
t("validateProposal allows a missing description", () => assert.equal(validateProposal({ name: "Walkers", description: "" }), null))

t("duplicate of an existing club", () => assert.match(duplicateMessage("book club", [{ name: "Book Club" }], []), /already a group/))
t("duplicate of an open proposal", () => assert.match(duplicateMessage("Morning walkers", [], [live(5)]), /already been proposed/))
t("expired proposal is not a duplicate", () => assert.equal(duplicateMessage("Morning walkers", [], [live(61)]), null))
t("declined proposal is not a duplicate", () => assert.equal(duplicateMessage("Morning walkers", [], [{ ...live(5), status: STATUS.DECLINED }]), null))
t("editing a proposal doesn't clash with itself", () => assert.equal(duplicateMessage("Morning walkers", [], [live(5)], "p1"), null))

t("parseThreshold default", () => assert.equal(parseThreshold(undefined), DEFAULT_THRESHOLD))
t("parseThreshold reads a number", () => assert.equal(parseThreshold("8"), 8))
t("parseThreshold clamps low", () => assert.equal(parseThreshold("0"), 2))
t("validateThreshold accepts 5", () => assert.equal(validateThreshold("5"), null))
t("validateThreshold rejects 1", () => assert.ok(validateThreshold(1)))
t("validateThreshold rejects a fraction", () => assert.ok(validateThreshold("4.5")))

t("expiry is 60 days after going live", () => assert.equal(expiresAt(live(0)).getTime() - NOW.getTime(), EXPIRY_DAYS * 86400000))
t("59 days live is not expired", () => assert.equal(isExpired(live(59), NOW), false))
t("60 days live is expired", () => assert.equal(isExpired(live(60), NOW), true))
t("pending never expires", () => assert.equal(isExpired({ status: STATUS.PENDING, live_at: null }, NOW), false))
t("daysLeft counts down", () => assert.equal(daysLeft(live(50), NOW), 10))

t("ready at the threshold", () => assert.equal(isReady(live(5), 5, 5, NOW), true))
t("not ready below the threshold", () => assert.equal(isReady(live(5), 4, 5, NOW), false))
t("not ready once expired", () => assert.equal(isReady(live(61), 9, 5, NOW), false))
t("alert fires once", () => {
  assert.equal(shouldAlertThreshold(live(5), 5, 5, NOW), true)
  assert.equal(shouldAlertThreshold(live(5, { threshold_alerted_at: NOW.toISOString() }), 6, 5, NOW), false)
})

t("residents see live proposals", () => assert.equal(visibleToResident(live(5), "m2", NOW), true))
t("residents don't see expired proposals", () => assert.equal(visibleToResident(live(61), "m2", NOW), false))
t("only the proposer sees their pending proposal", () => {
  const p = { status: STATUS.PENDING, proposed_by: "m1" }
  assert.equal(visibleToResident(p, "m1", NOW), true)
  assert.equal(visibleToResident(p, "m2", NOW), false)
})
t("nobody sees declined or created", () => {
  assert.equal(visibleToResident({ status: STATUS.DECLINED, proposed_by: "m1" }, "m1", NOW), false)
  assert.equal(visibleToResident({ status: STATUS.CREATED }, "m1", NOW), false)
})

t("admin buckets", () => {
  assert.equal(adminBucket({ status: STATUS.PENDING }, 1, 5, NOW), "pending")
  assert.equal(adminBucket(live(5), 5, 5, NOW), "ready")
  assert.equal(adminBucket(live(5), 2, 5, NOW), "live")
  assert.equal(adminBucket(live(70), 9, 5, NOW), "closed")
  assert.equal(adminBucket({ status: STATUS.CREATED }, 9, 5, NOW), "closed")
})
t("closed labels", () => {
  assert.equal(closedLabel({ status: STATUS.CREATED }, NOW), "Club created")
  assert.equal(closedLabel(live(70), NOW), "Expired")
  assert.equal(closedLabel({ status: STATUS.WITHDRAWN }, NOW), "Withdrawn")
})

t("slugify", () => assert.equal(slugify("Morning Walkers & Talkers!"), "morning-walkers-talkers"))
t("uniqueSlug avoids taken slugs", () => {
  assert.equal(uniqueSlug("Walkers", []), "walkers")
  assert.equal(uniqueSlug("Walkers", ["walkers", "walkers-2"]), "walkers-3")
})
t("countLine", () => {
  assert.equal(countLine(1, 5), "1 person would join · 5 needed")
  assert.match(countLine(5, 5), /5 people would join/)
})
t("decline vs close wording", () => {
  assert.match(declinedMessage("Walkers", ""), /wasn't approved\.$/)
  assert.match(declinedMessage("Walkers", "Already a club", true), /has been closed: Already a club/)
})
t("club created wording", () => {
  assert.match(clubCreatedMessage("Walkers", true), /Owner/)
  assert.match(clubCreatedMessage("Walkers", false), /member/)
})

console.log(`groupProposals: ${n} passed`)
