import assert from "node:assert/strict"
import {
  isWeakStartingPin, generateStartingPin, sortForWalking, filterForScope, firstName,
  cardLoginUrl, siteLabel, chunk, prefillUsername, buildWelcomeCardsHtml,
} from "../../lib/welcomeCards.js"

let n = 0
const t = (name, fn) => { fn(); n++ }

t("weak pins rejected", () => {
  for (const p of ["0000", "7777", "1234", "4321", "8901", "2109", "123", "12a4", ""]) assert.equal(isWeakStartingPin(p), true, p)
  for (const p of ["4826", "1357", "0472", "9910"]) assert.equal(isWeakStartingPin(p), false, p)
})

t("generateStartingPin pads and skips weak", () => {
  const seq = [1111, 1234, 42]
  const pin = generateStartingPin(() => seq.shift())
  assert.equal(pin, "0042")
  assert.equal(generateStartingPin(() => 1111), "4826")
  for (let i = 0; i < 200; i++) assert.equal(isWeakStartingPin(generateStartingPin((a, b) => a + Math.floor(Math.random() * (b - a)))), false)
})

t("sortForWalking numeric house then name", () => {
  const out = sortForWalking([
    { name: "Zed", house_number: "10" }, { name: "Amy", house_number: "9" },
    { name: "bob", house_number: "9" }, { name: "None" },
  ]).map(m => m.name)
  assert.deepEqual(out, ["Amy", "bob", "Zed", "None"])
})

t("filterForScope", () => {
  const list = [
    { id: 1, status: "active", auth_id: null }, { id: 2, status: "active", auth_id: "x" },
    { id: 3, status: "inactive", auth_id: null }, { id: 4, status: "active", auth_id: null, is_test: true },
  ]
  assert.deepEqual(filterForScope(list, "never").map(m => m.id), [1])
  assert.deepEqual(filterForScope(list, "all").map(m => m.id), [1, 2])
})

t("names, urls, chunks", () => {
  assert.equal(firstName("  Mary Jane Smith "), "Mary")
  assert.equal(firstName(""), "")
  assert.equal(cardLoginUrl("https://www.elementhappenings.com.au/", "JanC"), "https://www.elementhappenings.com.au/login?u=JanC")
  assert.equal(siteLabel("https://www.elementhappenings.com.au"), "elementhappenings.com.au")
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 4), [[1, 2, 3, 4], [5]])
  assert.deepEqual(chunk([], 4), [])
})

t("prefillUsername only accepts username-shaped values", () => {
  assert.equal(prefillUsername("JanC"), "JanC")
  assert.equal(prefillUsername(" Stuart_G "), "Stuart_G")
  for (const bad of [null, "", "ab", "<script>", "a b c", "x".repeat(41)]) assert.equal(prefillUsername(bad), "", String(bad))
})

t("html escapes and pages by four", () => {
  const cards = Array.from({ length: 5 }, (_, i) => ({ name: `R<${i}> Smith`, house_number: String(i + 1), username: `u${i}`, pin: "4826", qrSvg: "<svg></svg>" }))
  const html = buildWelcomeCardsHtml(cards, { site: "elementhappenings.com.au", helpLine: "Ask <Iain>" })
  assert.equal((html.match(/class="sheet"/g) || []).length, 2)
  assert.equal((html.match(/class="card"/g) || []).length, 5)
  assert.ok(html.includes("Welcome, R&lt;0&gt;"))
  assert.ok(html.includes("Need help? Ask &lt;Iain&gt;"))
  assert.ok(!html.includes("<Iain>"))
  assert.ok(html.includes("5 cards"))
  const noHelp = buildWelcomeCardsHtml(cards.slice(0, 1), { site: "x" })
  assert.ok(!noHelp.includes("Need help?"))
  assert.ok(noHelp.includes("1 card."))
})

t("failed residents are listed on the sheet, escaped", () => {
  const html = buildWelcomeCardsHtml([{ name: "A B", username: "ab", pin: "4826" }], { site: "x", failed: ["Marjorie <C>"] })
  assert.ok(html.includes("No card for: Marjorie &lt;C&gt;"))
  assert.ok(!buildWelcomeCardsHtml([], { site: "x" }).includes("No card for"))
})

console.log(`welcomeCards: ${n} tests passed`)
