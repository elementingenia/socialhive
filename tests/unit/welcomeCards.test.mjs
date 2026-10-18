import assert from "node:assert/strict"
import {
  isWeakStartingPin, generateStartingPin, sortForWalking, filterForScope, firstName,
  cardLoginUrl, siteLabel, chunk, prefillUsername, matchesResidentSearch,
} from "../../lib/welcomeCards.js"
import { buildWelcomeCardsPdf, qrRuns } from "../../lib/welcomeCardsPdf.js"
import { PDFDocument } from "pdf-lib"
import QRCode from "qrcode"

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

t("search: digits match the house number exactly, words match name or username", () => {
  const m = { name: "Mary Jane Smith", username: "MaryS", house_number: "77" }
  for (const q of ["", "  ", "77", "#77", "# 77", "077", "mary", "SMITH", "jane s", "marys"]) assert.equal(matchesResidentSearch(m, q), true, q)
  for (const q of ["7", "17", "770", "bob", "#7"]) assert.equal(matchesResidentSearch(m, q), false, q)
  assert.equal(matchesResidentSearch({ name: "No House", username: "nh" }, "12"), false)
  assert.equal(matchesResidentSearch(null, "x"), false)
})

const tests = [
  (async () => {
    // QR runs decode back to the same module grid the qrcode package made.
    const url = "https://elementhappenings.com.au/login?u=MaryS"
    const { size, runs } = qrRuns(url)
    const mods = QRCode.create(url, { errorCorrectionLevel: "M" }).modules
    assert.equal(size, mods.size)
    let dark = 0
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (mods.get(r, c)) dark++
    assert.equal(runs.reduce((a, r) => a + r.w, 0), dark)
    for (const r of runs) for (let c = r.x; c < r.x + r.w; c++) assert.ok(mods.get(r.y, c))
    n++
  })(),
  (async () => {
    // One PDF, four cards to an A4 page; awkward text never breaks the build.
    const cards = Array.from({ length: 5 }, (_, i) => ({
      name: i === 0 ? "Hēmi “Jim” O’Brien 😀" : `Resident ${i}`, house_number: String(i + 1),
      username: i === 1 ? "averyveryverylongusername_x40" : `u${i}`, pin: "4826",
      loginUrl: `https://elementhappenings.com.au/login?u=u${i}`,
    }))
    const bytes = await buildWelcomeCardsPdf(cards, { site: "elementhappenings.com.au", helpLine: "Ask Iain, house 77, 0400 000 000. ".repeat(4) })
    const doc = await PDFDocument.load(bytes)
    assert.equal(doc.getPageCount(), 2)
    assert.equal(doc.getTitle(), "Welcome cards")
    const [w, h] = [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()]
    assert.ok(Math.abs(w - 595.28) < 0.1 && Math.abs(h - 841.89) < 0.1)
    const one = await PDFDocument.load(await buildWelcomeCardsPdf(cards.slice(0, 4), { site: "x" }))
    assert.equal(one.getPageCount(), 1)
    n += 1
  })(),
]

await Promise.all(tests)
console.log(`welcomeCards: ${n} tests passed`)
