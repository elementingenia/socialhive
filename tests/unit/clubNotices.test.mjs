import assert from "node:assert/strict"
import { clubNoticeMessage, clubForNoticeMessage, clubNoticeLink } from "../../lib/clubNotices.js"

let n = 0
const t = (name, fn) => { fn(); n++ }

const clubs = [
  { name: "Community Outings", slug: "community-outings" },
  { name: "Book Club", slug: "book-club" },
  { name: "Book Club Extra", slug: "book-club-extra" },
  { name: "Notice Board Fans", slug: "notice-fans" },
  { name: "No slug", slug: null },
]

t("message strips HTML", () => assert.equal(clubNoticeMessage("Book Club", "<p><b>Meet</b>&nbsp;Tues</p>"), "New Book Club notice: Meet Tues"))
t("message truncates long text", () => {
  const m = clubNoticeMessage("Book Club", "x".repeat(200))
  assert.ok(m.endsWith("…")); assert.equal(m.length, "New Book Club notice: ".length + 89)
})
t("finds club from live message shape", () => assert.equal(
  clubForNoticeMessage("New Community Outings notice: Hi, I'm looking at organising a lunch…", clubs)?.slug, "community-outings"))
t("round trip", () => assert.equal(clubForNoticeMessage(clubNoticeMessage("Book Club", "hi"), clubs)?.slug, "book-club"))
t("longest name wins", () => assert.equal(clubForNoticeMessage("New Book Club Extra notice: hi", clubs)?.slug, "book-club-extra"))
t("name containing 'Notice'", () => assert.equal(clubForNoticeMessage("New Notice Board Fans notice: x", clubs)?.slug, "notice-fans"))
t("unknown/renamed club -> null", () => assert.equal(clubForNoticeMessage("New Old Name notice: x", clubs), null))
t("club without slug ignored", () => assert.equal(clubForNoticeMessage("New No slug notice: x", clubs), null))
t("null message safe", () => assert.equal(clubForNoticeMessage(null, clubs), null))
t("link with slug", () => assert.equal(clubNoticeLink("book-club"), "/clubs/book-club"))
t("link fallback", () => assert.equal(clubNoticeLink(null), "/clubs"))

console.log(`clubNotices: ${n} passed`)
