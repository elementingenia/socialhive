import assert from "node:assert/strict"
import { isHtmlContent } from "../../lib/richText.js"

let n = 0
const t = (name, fn) => { fn(); n++ }

t("tagged html", () => assert.equal(isHtmlContent("<p>Hi</p>"), true))
t("entity-only text (the live bug)", () => assert.equal(isHtmlContent("rather than cancel entirely. &nbsp;Based on what we know&nbsp;"), true))
t("numeric entity", () => assert.equal(isHtmlContent("It&#39;s"), true))
t("hex entity", () => assert.equal(isHtmlContent("a&#x27;b"), true))
t("amp entity", () => assert.equal(isHtmlContent("Fish &amp; chips"), true))
t("bare ampersand stays plain", () => assert.equal(isHtmlContent("Fish & chips"), false))
t("ampersand word no semicolon", () => assert.equal(isHtmlContent("R&D today"), false))
t("plain text", () => assert.equal(isHtmlContent("Just words"), false))
t("bbcode stays plain", () => assert.equal(isHtmlContent("[b]bold[/b]"), false))
t("empty/null", () => { assert.equal(isHtmlContent(""), false); assert.equal(isHtmlContent(null), false); assert.equal(isHtmlContent(undefined), false) })
t("less-than in prose", () => assert.equal(isHtmlContent("a < b and c > d"), false))

console.log(`richText: ${n} passed`)
