import assert from "node:assert/strict"
import { HUBS_WITH_MEMBERS, hubNoticeHomeFromMessage, hubHasNotices, hubNoticeHome, noticeMessage, noticeRecipients } from "../../lib/hubNotices.js"

let n = 0
const t = (name, fn) => { fn(); n++ }

t("Show Time has notices", () => assert.equal(hubHasNotices("movie"), true))
t("Social has no notices", () => assert.equal(hubHasNotices("social"), false))
t("Special Events has no notices", () => assert.equal(hubHasNotices("special"), false))
t("unknown hub has no notices", () => assert.equal(hubHasNotices("nope"), false))
t("prototype keys aren't hubs", () => assert.equal(hubHasNotices("toString"), false))
t("home path for movie", () => assert.equal(hubNoticeHome("movie"), "/movies"))
t("home path null for social", () => assert.equal(hubNoticeHome("social"), null))
t("message strips HTML", () => assert.equal(noticeMessage("movie", "<p><b>Film</b>&nbsp;night moved</p>"), "New Show Time notice: Film night moved"))
t("message truncates long text", () => {
  const m = noticeMessage("movie", "x".repeat(200))
  assert.ok(m.endsWith("…")); assert.equal(m.length, "New Show Time notice: ".length + 89)
})
t("recipients exclude author", () => assert.deepEqual(noticeRecipients(["a", "b", "c"], "b"), ["a", "c"]))
t("recipients de-dupe and drop nulls", () => assert.deepEqual(noticeRecipients(["a", null, "a", "c"], "z"), ["a", "c"]))
t("recipients handle empty", () => assert.deepEqual(noticeRecipients(null, "a"), []))
t("only member hubs listed", () => assert.deepEqual(Object.keys(HUBS_WITH_MEMBERS), ["movie"]))
t("drawer routes a Show Time notice home", () => assert.equal(hubNoticeHomeFromMessage(noticeMessage("movie", "hi")), "/movies"))
t("drawer ignores other messages", () => assert.equal(hubNoticeHomeFromMessage("New Book Club notice: x"), null))

console.log(`hubNotices: ${n} passed`)
