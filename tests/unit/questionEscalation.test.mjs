import assert from "node:assert/strict"
import { ownerTierIds, escalationStep, escalationMessage, ESCALATE_AFTER_DAYS } from "../../lib/questionEscalation.js"

const DAY = 24 * 60 * 60 * 1000
const now = new Date("2026-10-26T00:00:00Z")
const ago = d => new Date(now.getTime() - d * DAY).toISOString()
let n = 0
const t = (name, fn) => { fn(); n++ }

t("days constant", () => assert.equal(ESCALATE_AFTER_DAYS, 5))

// ownerTierIds
t("owner tier drops already-asked and asker", () =>
  assert.deepEqual(ownerTierIds(["o1", "ec1", "ask"], ["ec1"], "ask"), ["o1"]))
t("owner tier empty when owner was the original recipient", () =>
  assert.deepEqual(ownerTierIds(["o1"], ["o1"], "x"), []))
t("owner tier dedupes", () => assert.deepEqual(ownerTierIds(["o1", "o1"], [], "x"), ["o1"]))
t("owner tier handles nulls", () => assert.deepEqual(ownerTierIds(null, null, "x"), []))

// escalationStep
const q = (over = {}) => ({ status: "open", created_at: ago(6), owner_escalated_at: null, escalated_at: null, ...over })
t("too young -> nothing", () => assert.equal(escalationStep(q({ created_at: ago(4) }), ["o1"], now), null))
t("5 days with owner tier -> owner", () => assert.equal(escalationStep(q(), ["o1"], now), "owner"))
t("5 days, no owner tier -> admin", () => assert.equal(escalationStep(q(), [], now), "admin"))
t("owner told 2 days ago -> wait", () => assert.equal(escalationStep(q({ owner_escalated_at: ago(2) }), [], now), null))
t("owner told 5 days ago -> admin", () => assert.equal(escalationStep(q({ created_at: ago(10), owner_escalated_at: ago(5) }), [], now), "admin"))
t("already sent to admins -> nothing", () => assert.equal(escalationStep(q({ escalated_at: ago(1) }), ["o1"], now), null))
t("answered -> nothing", () => assert.equal(escalationStep(q({ status: "answered" }), ["o1"], now), null))
t("closed -> nothing", () => assert.equal(escalationStep(q({ status: "closed" }), [], now), null))

// escalationMessage
t("message uses real age", () => assert.equal(
  escalationMessage({ created_at: ago(10), subject: "Machine sewing" }, "Jill", "Machine Sewing", now),
  'Unanswered for 10 days -- Jill asked Machine Sewing: "Machine sewing"'))
t("message never under 5 days", () => assert.match(
  escalationMessage({ created_at: ago(5.2), subject: "x" }, "A", "B", now), /Unanswered for 5 days/))
t("message trims subject", () => assert.equal(
  escalationMessage({ created_at: ago(6), subject: "y".repeat(100) }, "A", "B", now).split('"')[1].length, 80))

console.log(`questionEscalation: ${n} passed`)
