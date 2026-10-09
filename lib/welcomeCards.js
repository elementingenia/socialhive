// Welcome cards & Sign-in Help (Iain, 2026-10-09, scope:
// claude/Element_Happenings_Welcome_Cards_Scope_Answered.md). Admin prints a
// card per resident: username, a fresh one-time password, a QR code to the
// sign-in page with the username filled in, and three steps. Pure logic only
// (no DB, no randomness source of its own) so the API route and the unit
// tests share it.

export const HELP_SETTING_KEY = "welcome_card_help"
export const CARDS_PER_SHEET = 4

// Easy to read aloud and type for an older audience: 4 digits. Rejects the
// guessable ones (all the same digit, straight runs up or down). It is a
// one-time password: the resident must replace it at first sign-in.
export function isWeakStartingPin(pin) {
  const p = String(pin)
  if (!/^\d{4}$/.test(p)) return true
  if (/^(\d)\1{3}$/.test(p)) return true
  const d = p.split("").map(Number)
  const up = d.every((n, i) => i === 0 || n === (d[i - 1] + 1) % 10)
  const down = d.every((n, i) => i === 0 || n === (d[i - 1] + 9) % 10)
  return up || down
}

/** randomInt(min, maxExclusive) is injected (crypto.randomInt in the route). */
export function generateStartingPin(randomInt) {
  for (let i = 0; i < 50; i++) {
    const pin = String(randomInt(0, 10000)).padStart(4, "0")
    if (!isWeakStartingPin(pin)) return pin
  }
  return "4826"
}

function houseNum(m) {
  const n = parseInt(m?.house_number, 10)
  return Number.isFinite(n) ? n : Infinity
}

/** Walking order: house number ascending (numeric), then name. */
export function sortForWalking(list) {
  return [...(list || [])].sort((a, b) =>
    houseNum(a) - houseNum(b) ||
    String(a.name || "").localeCompare(String(b.name || ""), "en", { sensitivity: "base" }))
}

/** scope "never" = residents with no login yet; "all" = everyone (reprints). */
export function filterForScope(list, scope) {
  return (list || []).filter(m => m && m.status === "active" && !m.is_test &&
    (scope === "all" || !m.auth_id))
}

export function firstName(name) {
  const n = String(name || "").trim()
  return n ? n.split(/\s+/)[0] : ""
}

export function cardLoginUrl(origin, username) {
  return `${String(origin || "").replace(/\/+$/, "")}/login?u=${encodeURIComponent(username || "")}`
}

/** Hostname as printed on the card ("elementhappenings.com.au"). */
export function siteLabel(origin) {
  try { return new URL(origin).hostname.replace(/^www\./, "") } catch { return String(origin || "") }
}

export function chunk(list, size = CARDS_PER_SHEET) {
  const out = []
  for (let i = 0; i < (list || []).length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** Login page ?u= prefill: same rules as a username, else ignored. */
export function prefillUsername(raw) {
  const u = String(raw || "").trim()
  return /^[a-zA-Z0-9_]{3,40}$/.test(u) ? u : ""
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))

/**
 * Printable HTML: A4 pages, four A6 cards each, dashed cut lines.
 * cards: [{ name, house_number, username, pin, qrSvg }]
 * qrSvg is generated server-side by the qrcode package (trusted markup).
 */
export function buildWelcomeCardsHtml(cards, { site, helpLine } = {}) {
  const help = String(helpLine || "").trim()
  const card = (c) => `
    <div class="card">
      <div class="brand">Element Happenings</div>
      <div class="hello">Welcome, ${esc(firstName(c.name) || c.name)}</div>
      ${c.house_number ? `<div class="house">House ${esc(c.house_number)}</div>` : ""}
      <div><div class="lbl">Website</div><div class="val site">${esc(site)}</div></div>
      <div class="row">
        <div class="creds">
          <div class="lbl">Username</div><div class="val">${esc(c.username)}</div>
          <div class="lbl">Password</div><div class="val">${esc(c.pin)}</div>
        </div>
        <div class="qr">${c.qrSvg || ""}<div class="qrcap">Scan to sign in</div></div>
      </div>
      <ol>
        <li>Open the website, or scan the code with your phone camera.</li>
        <li>Enter your username and password, then tap Sign In.</li>
        <li>Choose your own new password. Keep it somewhere safe.</li>
      </ol>
      ${help ? `<div class="help">Need help? ${esc(help)}</div>` : ""}
    </div>`

  const pages = chunk(cards || [], CARDS_PER_SHEET)
    .map(p => `<section class="sheet">${p.map(card).join("")}</section>`).join("")

  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="color-scheme" content="light only" />
<title>Welcome cards</title>
<style>
  * { box-sizing: border-box; }
  html, body { background: #fff; margin: 0; color: #111827;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  .print-btn { margin: 16px; padding: 8px 16px; font-size: 13px; font-weight: 600; border-radius: 8px;
    border: 1px solid #d1d5db; background: #f9fafb; cursor: pointer; }
  .note { margin: 0 16px 16px; font-size: 12px; color: #6b7280; }
  .sheet { width: 210mm; height: 297mm; display: grid; grid-template-columns: 105mm 105mm;
    grid-template-rows: 148.5mm 148.5mm; margin: 0 auto 12px; page-break-after: always; break-after: page; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .card { border: 1px dashed #9ca3af; padding: 8mm 7mm; display: flex; flex-direction: column; gap: 3mm; overflow: hidden; }
  .brand { font-size: 10pt; font-weight: 700; color: #C08E43; letter-spacing: 0.04em; text-transform: uppercase; }
  .hello { font-size: 21pt; font-weight: 800; line-height: 1.15; }
  .house { font-size: 13pt; color: #4b5563; margin-top: -2mm; }
  .row { display: flex; gap: 4mm; align-items: flex-start; }
  .creds { flex: 1; min-width: 0; }
  .lbl { font-size: 9.5pt; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 1.5mm; }
  .creds .lbl:first-child { margin-top: 0; }
  .val { font-size: 19pt; font-weight: 800; word-break: break-all; }
  .val.site { font-size: 15pt; word-break: normal; white-space: nowrap; }
  .qr { width: 34mm; flex-shrink: 0; text-align: center; }
  .qr svg { width: 34mm; height: 34mm; display: block; }
  .qrcap { font-size: 9pt; color: #6b7280; }
  ol { margin: 0; padding-left: 6mm; font-size: 13pt; line-height: 1.35; }
  li { margin-bottom: 1mm; }
  .help { margin-top: auto; font-size: 12.5pt; font-weight: 600; border-top: 1px solid #e5e7eb; padding-top: 2mm; }
  @page { size: A4; margin: 0; }
  @media print { .print-btn, .note { display: none } .sheet { margin: 0 } }
</style></head>
<body>
  <button class="print-btn" onclick="window.print()">🖨 Print cards</button>
  <div class="note">${(cards || []).length} card${(cards || []).length === 1 ? "" : "s"}. Print on A4, cut along the dashed lines.
    Each card is a password: hand it to the resident or put it in their letterbox, never leave it in a common area.</div>
  ${pages}
</body></html>`
}
