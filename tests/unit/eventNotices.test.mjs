import assert from "node:assert/strict"
import { eventNoticeMessage, eventNoticeRecipients, viewableEventIds, eventTakesNotices } from "../../lib/eventNotices.js"

let n = 0
const t = (name, fn) => { fn(); n++ }

t("message strips html and prefixes title", () => {
  assert.equal(eventNoticeMessage("Melbourne Cup", "<p>Meet at <b>gate 3</b>&nbsp;at 11</p>"),
    "Notice for Melbourne Cup: Meet at gate 3 at 11")
})
t("message falls back when no title", () => {
  assert.ok(eventNoticeMessage("", "hi").startsWith("Notice for your event:"))
})
t("message truncates long text", () => {
  const m = eventNoticeMessage("X", "a".repeat(200))
  assert.ok(m.endsWith("…"))
  assert.ok(m.length < 110)
})
t("message decodes &amp;", () => {
  assert.equal(eventNoticeMessage("X", "fish &amp; chips"), "Notice for X: fish & chips")
})

const bookings = [
  { id: "b1", member_id: "m1", status: "confirmed" },
  { id: "b2", member_id: "m2", status: "waitlist" },
  { id: "b3", member_id: "m3", status: "cancelled" },
  { id: "b4", member_id: null, contact_id: "c1", status: "confirmed" },
  { id: "b5", member_id: "m1", status: "confirmed" },
]
t("recipients: confirmed + waitlist, not cancelled, de-duplicated", () => {
  const r = eventNoticeRecipients(bookings, [], null)
  assert.deepEqual(r.memberIds.sort(), ["m1", "m2"])
  assert.equal(r.noAppCount, 1)
})
t("recipients: party residents of an active booking included", () => {
  const party = [
    { owner_id: "m1", member_id: "m9" },
    { owner_id: "m3", member_id: "m8" },          // owner cancelled -> excluded
    { owner_id: "m1", contact_id: "c2" },         // no-app contact
    { owner_contact_id: "c1", member_id: "m7" },  // contact-owned party, active
    { owner_id: "m2", guest_name: "Bob" },        // guest, ignored
  ]
  const r = eventNoticeRecipients(bookings, party, null)
  assert.deepEqual(r.memberIds.sort(), ["m1", "m2", "m7", "m9"])
  assert.equal(r.noAppCount, 2)
})
t("recipients: author excluded", () => {
  const r = eventNoticeRecipients(bookings, [], "m1")
  assert.deepEqual(r.memberIds, ["m2"])
})
t("recipients: empty input", () => {
  assert.deepEqual(eventNoticeRecipients(null, null, null), { memberIds: [], noAppCount: 0 })
})
t("viewable: managed or attending only", () => {
  const s = viewableEventIds(["e1", "e2", "e3"], ["e1"], ["e3", "e9"])
  assert.deepEqual([...s].sort(), ["e1", "e3"])
})
t("takes notices unless open all-welcome", () => {
  assert.equal(eventTakesNotices({ booking_required: false }), false)
  assert.equal(eventTakesNotices({ booking_required: true }), true)
  assert.equal(eventTakesNotices({}), true)
  assert.equal(eventTakesNotices(null), false)
})

console.log(`eventNotices: ${n} passed`)
