import assert from "node:assert/strict"
import {
  normaliseSteps, cleanDraft, validateDraft, isSendTime, featureDateLabel, featureDocTitle,
  featureMessage, featureRecipients, normaliseAudience, featureDocLink, nextSendLabel,
  docMatchesQuery, visibleDocuments, orderPills, isInFolder, isInfoPath, sortNewestFirst, MAX_STEPS,
} from "../../lib/newFeatures.js"
import { buildFeatureAnnouncementPdf } from "../../lib/featureAnnouncementPdf.js"

let n = 0
const t = (name, fn) => { try { fn(); n++ } catch (e) { console.error("FAIL:", name); throw e } }

// ── Drafts ───────────────────────────────────────────────────────────────────
t("steps from text, numbering/bullets stripped", () =>
  assert.deepEqual(normaliseSteps("1. Open Info\n- Tap Documents\n\n  • Search  "), ["Open Info", "Tap Documents", "Search"]))
t("steps capped at 6", () => assert.equal(normaliseSteps("a\nb\nc\nd\ne\nf\ng\nh").length, MAX_STEPS))
t("steps from array, junk dropped", () => assert.deepEqual(normaliseSteps(["a", "", 3, " b "]), ["a", "b"]))
t("steps non-array -> []", () => assert.deepEqual(normaliseSteps(null), []))
t("cleanDraft trims and nulls empties", () => {
  const d = cleanDraft({ title: "  Search  ", summary: " Find docs ", what_it_does: "  ", how_to_use: "x" })
  assert.equal(d.title, "Search"); assert.equal(d.summary, "Find docs")
  assert.equal(d.what_it_does, null); assert.deepEqual(d.how_to_use, ["x"]); assert.equal(d.where_to_find, null)
})
t("cleanDraft caps title length", () => assert.equal(cleanDraft({ title: "x".repeat(500) }).title.length, 120))
t("validate needs title", () => assert.equal(validateDraft({ summary: "s" }), "Title is required"))
t("validate needs summary", () => assert.equal(validateDraft({ title: "t" }), "One-line summary is required"))
t("validate ok", () => assert.equal(validateDraft({ title: "t", summary: "s" }), null))

// ── Send time: 21:30 / 22:30 UTC, only the 08:xx Sydney one sends ────────────
t("AEST 22:30Z = 08:30 Sydney -> send", () => assert.equal(isSendTime(new Date("2026-09-30T22:30:00Z")), true))
t("AEST 21:30Z = 07:30 Sydney -> no", () => assert.equal(isSendTime(new Date("2026-09-30T21:30:00Z")), false))
t("AEDT 21:30Z = 08:30 Sydney -> send", () => assert.equal(isSendTime(new Date("2026-10-05T21:30:00Z")), true))
t("AEDT 22:30Z = 09:30 Sydney -> no", () => assert.equal(isSendTime(new Date("2026-10-05T22:30:00Z")), false))
t("late Hobby trigger 21:55Z AEDT still 08:xx", () => assert.equal(isSendTime(new Date("2026-10-05T21:55:00Z")), true))

t("date label", () => assert.equal(featureDateLabel("2026-10-04"), "4 October 2026"))
t("doc title", () => assert.equal(featureDocTitle("2026-10-04"), "New Features — 4 October 2026"))
t("doc link", () => assert.equal(featureDocLink("2026-10-04"), "/info/documents?nf=2026-10-04"))
t("next send before 8:30", () => assert.equal(nextSendLabel(new Date("2026-10-04T20:00:00Z")), "Goes out at 8:30am today"))   // 07:00 AEDT
t("next send after 8:30", () => assert.equal(nextSendLabel(new Date("2026-10-04T23:00:00Z")), "Goes out at 8:30am tomorrow")) // 10:00 AEDT

// ── Message + recipients ─────────────────────────────────────────────────────
t("no features -> null", () => assert.equal(featureMessage([]), null))
t("one feature", () => assert.equal(featureMessage([{ title: "Search" }]),
  "New in Element Happenings: Search. Tap to see how it works."))
t("two features", () => assert.equal(featureMessage([{ title: "A" }, { title: "B" }]),
  "2 new features in Element Happenings: A and B. Tap to see how they work."))
t("three features", () => assert.equal(featureMessage([{ title: "A" }, { title: "B" }, { title: "C" }]),
  "3 new features in Element Happenings: A, B and C. Tap to see how they work."))
t("five features -> and N more", () => assert.equal(
  featureMessage(["A", "B", "C", "D", "E"].map(title => ({ title }))),
  "5 new features in Element Happenings: A, B, C and 2 more. Tap to see how they work."))
t("audience garbled -> admins", () => assert.equal(normaliseAudience("x"), "admins"))
const people = [
  { id: "admin", status: "active", auth_id: "a", is_admin: true },
  { id: "res", status: "active", auth_id: "b", is_admin: false },
  { id: "nologin", status: "active", auth_id: null, is_admin: false },
  { id: "inactive", status: "inactive", auth_id: "c", is_admin: true },
  { id: "bot", status: "active", auth_id: "d", is_admin: true, is_test: true },
]
t("admins only", () => assert.deepEqual(featureRecipients(people, "admins"), ["admin"]))
t("community", () => assert.deepEqual(featureRecipients(people, "community"), ["admin", "res"]))

// ── Documents page ───────────────────────────────────────────────────────────
const NF = "nf-cat", GEN = "gen-cat"
const docs = [
  { id: "1", title: "AGM Minutes", description: "Annual meeting", file_name: "agm.pdf", created_at: "2026-09-01T00:00:00Z", categories: [{ id: GEN, name: "General" }] },
  { id: "2", title: "New Features — 4 October 2026", description: "Search in Documents", file_name: "New-Features-2026-10-04.pdf", created_at: "2026-10-04T00:00:00Z", categories: [{ id: NF, name: "New Features" }] },
  { id: "3", title: "Pool rules", description: null, file_name: "pool.docx", created_at: "2026-09-20T00:00:00Z", categories: [{ id: GEN, name: "General" }] },
]
t("All excludes the folder, newest first", () =>
  assert.deepEqual(visibleDocuments({ docs, filter: "all", folderId: NF }).map(d => d.id), ["3", "1"]))
t("folder pill shows only folder", () =>
  assert.deepEqual(visibleDocuments({ docs, filter: NF, folderId: NF }).map(d => d.id), ["2"]))
t("search on All covers the folder too", () =>
  assert.deepEqual(visibleDocuments({ docs, filter: "all", query: "search", folderId: NF }).map(d => d.id), ["2"]))
t("search narrowed by pill", () =>
  assert.deepEqual(visibleDocuments({ docs, filter: GEN, query: "search", folderId: NF }).map(d => d.id), []))
t("1-letter query ignored", () =>
  assert.deepEqual(visibleDocuments({ docs, filter: "all", query: "p", folderId: NF }).map(d => d.id), ["3", "1"]))
t("search matches file name", () => assert.equal(docMatchesQuery(docs[2], "docx"), true))
t("search matches category name", () => assert.equal(docMatchesQuery(docs[0], "general"), true))
t("multi-word search needs every word", () => {
  assert.equal(docMatchesQuery(docs[0], "agm annual"), true)
  assert.equal(docMatchesQuery(docs[0], "agm pool"), false)
})
t("no folder configured -> All shows everything", () =>
  assert.deepEqual(visibleDocuments({ docs, filter: "all", folderId: null }).map(d => d.id), ["2", "3", "1"]))
t("sort is stable on missing dates", () => assert.equal(sortNewestFirst([{ id: "a" }, { id: "b", created_at: "2026" }])[0].id, "b"))
t("folder pill last", () => assert.deepEqual(
  orderPills([{ id: NF }, { id: GEN }, { id: "x" }], NF).map(c => c.id), [GEN, "x", NF]))
t("isInFolder", () => { assert.equal(isInFolder(docs[1], NF), true); assert.equal(isInFolder(docs[0], NF), false) })

// ── Find button hidden on Info ───────────────────────────────────────────────
t("info paths", () => {
  assert.equal(isInfoPath("/info"), true); assert.equal(isInfoPath("/info/documents"), true)
  assert.equal(isInfoPath("/information"), false); assert.equal(isInfoPath("/home"), false); assert.equal(isInfoPath(null), false)
})

// ── PDF builds (incl. emoji and long words that the font can't draw / fit) ───
const bytes = await buildFeatureAnnouncementPdf({ dateStr: "2026-10-04", features: [
  { title: "Search in Documents 🎉", summary: "Find a “document” fast…", what_it_does: "x ".repeat(400),
    how_to_use: ["Open Info", "https://example.com/" + "a".repeat(200)], where_to_find: "Info › Documents" },
  { title: "Second", summary: "s", how_to_use: [] },
] })
t("pdf is a PDF", () => assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-"))
t("pdf has content", () => assert.ok(bytes.length > 1500))

console.log(`newFeatures: ${n} passed`)
