import assert from "node:assert/strict"
import { digestWindow, digestMessage, digestHasContent, digestRecipients } from "../../lib/digest.js"

let n = 0
const t = (name, fn) => { fn(); n++ }
const SUN = new Date("2026-10-04T05:00:00Z") // Sun 4 Oct, 4pm Sydney (AEDT)

t("window is 7 Sydney days", () => {
  const w = digestWindow(SUN)
  assert.equal(w.from, "2026-10-04"); assert.equal(w.to, "2026-10-10")
})
t("window uses Sydney date not UTC", () => {
  // 3 Oct 14:30 UTC = 4 Oct 00:30 Sydney
  assert.equal(digestWindow(new Date("2026-10-03T14:30:00Z")).from, "2026-10-04")
})
t("since is 7 days back", () => assert.equal(digestWindow(SUN).sinceIso, "2026-09-27T05:00:00.000Z"))

t("quiet week -> null", () => assert.equal(digestMessage({ events: 0, newGroups: 0 }), null))
t("quiet week, invites alone still null", () => assert.equal(digestMessage({}, 3), null))
t("hasContent false when quiet", () => assert.equal(digestHasContent({}), false))
t("hasContent true with an event", () => assert.equal(digestHasContent({ events: 1 }), true))
t("hasContent true with only a survey", () => assert.equal(digestHasContent({ surveys: 1 }), true))
t("full message", () => assert.equal(
  digestMessage({ events: 6, newGroups: 1, news: 2, committee: 1, votes: 1, surveys: 2 }),
  "This week at Element Happenings: 6 events, 1 new group, 2 news posts, 1 Committee update, 1 vote open, 2 surveys open"))
t("singular/plural", () => assert.equal(digestMessage({ events: 1 }), "This week at Element Happenings: 1 event"))
t("invites appended", () => assert.equal(digestMessage({ events: 2 }, 1), "This week at Element Happenings: 2 events, plus 1 invite for you"))
t("invites plural", () => assert.equal(digestMessage({ events: 2 }, 3), "This week at Element Happenings: 2 events, plus 3 invites for you"))

t("recipients filter", () => {
  const ms = [
    { id: "a", status: "active", auth_id: "x", is_test: false, weekly_digest: true },
    { id: "b", status: "active", auth_id: null, is_test: false, weekly_digest: true },  // never logged in
    { id: "c", status: "active", auth_id: "x", is_test: true, weekly_digest: true },    // test bot
    { id: "d", status: "active", auth_id: "x", is_test: false, weekly_digest: false },  // switched off
    { id: "e", status: "inactive", auth_id: "x", is_test: false, weekly_digest: true },
    { id: "f", status: "active", auth_id: "x", is_test: false },                         // column default -> on
    null,
  ]
  assert.deepEqual(digestRecipients(ms), ["a", "f"])
})

console.log(`digest: ${n} passed`)
