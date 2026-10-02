import assert from "node:assert/strict"
import { INVITE_CAP_PER_SENDER, canInviteToEvent, planInvites, inviteMessage } from "../../lib/eventInvites.js"

let n = 0
const t = (name, fn) => { fn(); n++ }
const NOW = new Date("2026-10-05T02:00:00Z") // Mon 5 Oct, 1pm Sydney (AEDT)

t("cap is 10", () => assert.equal(INVITE_CAP_PER_SENDER, 10))
t("future open event can invite", () => assert.equal(canInviteToEvent({ event_date: "2026-10-10", event_time: "18:00" }, NOW), true))
t("past event cannot", () => assert.equal(canInviteToEvent({ event_date: "2026-10-01", event_time: "18:00" }, NOW), false))
t("started today cannot", () => assert.equal(canInviteToEvent({ event_date: "2026-10-05", event_time: "12:00" }, NOW), false))
t("later today can", () => assert.equal(canInviteToEvent({ event_date: "2026-10-05", event_time: "18:00" }, NOW), true))
t("archived cannot", () => assert.equal(canInviteToEvent({ event_date: "2026-10-10", archived: true }, NOW), false))
t("bookings closed cannot", () => assert.equal(canInviteToEvent({ event_date: "2026-10-10", reservation_cutoff: "2026-10-04T00:00:00Z" }, NOW), false))
t("open all-welcome event ignores cutoff", () => assert.equal(canInviteToEvent({ event_date: "2026-10-10", booking_required: false, reservation_cutoff: "2026-10-04T00:00:00Z" }, NOW), true))
t("null event cannot", () => assert.equal(canInviteToEvent(null, NOW), false))

t("plain invite", () => {
  const p = planInvites({ requestedIds: ["a", "b"], senderId: "me" })
  assert.deepEqual(p.toInvite, ["a", "b"]); assert.equal(p.skipped, 0); assert.equal(p.remaining, 8); assert.equal(p.capReached, false)
})
t("never yourself", () => assert.deepEqual(planInvites({ requestedIds: ["me", "a"], senderId: "me" }).toInvite, ["a"]))
t("dedupes requested", () => assert.deepEqual(planInvites({ requestedIds: ["a", "a", null], senderId: "me" }).toInvite, ["a"]))
t("skips booked", () => assert.deepEqual(planInvites({ requestedIds: ["a", "b"], senderId: "me", bookedIds: ["a"] }).toInvite, ["b"]))
t("skips already invited by anyone", () => assert.deepEqual(planInvites({ requestedIds: ["a", "b"], senderId: "me", alreadyInvitedIds: ["b"] }).toInvite, ["a"]))
t("skips ineligible", () => assert.deepEqual(planInvites({ requestedIds: ["a", "t"], senderId: "me", ineligibleIds: ["t"] }).toInvite, ["a"]))
t("cap trims", () => {
  const p = planInvites({ requestedIds: ["a", "b", "c"], senderId: "me", senderSentCount: 8 })
  assert.deepEqual(p.toInvite, ["a", "b"]); assert.equal(p.capReached, true); assert.equal(p.remaining, 0); assert.equal(p.skipped, 1)
})
t("cap fully used", () => {
  const p = planInvites({ requestedIds: ["a"], senderId: "me", senderSentCount: 10 })
  assert.deepEqual(p.toInvite, []); assert.equal(p.capReached, true)
})
t("over-count never negative", () => assert.equal(planInvites({ requestedIds: ["a"], senderId: "me", senderSentCount: 15 }).remaining, 0))
t("message wording", () => assert.equal(inviteMessage("Jan Smith", "Trivia Night"), "Jan Smith thinks you'd enjoy Trivia Night"))
t("message fallbacks", () => assert.equal(inviteMessage("", ""), "A neighbour thinks you'd enjoy an event"))

console.log(`eventInvites: ${n} passed`)
