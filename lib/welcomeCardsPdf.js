// Welcome cards as ONE PDF (Iain, 2026-10-19: "The print should be a single
// PDF if possible rather than web page"). Replaces the printable HTML page.
// Same card as before: A4 pages, four A6 cards each, dashed cut lines;
// brand, "Welcome, <first name>", house, website, username, password, QR
// code to the sign-in page with the username filled in, three steps and the
// optional "Need help?" line.
//
// Server-only (pdf-lib + qrcode, pure JS). Relative imports only so
// tests/unit/welcomeCards.test.mjs can run it under plain Node.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import QRCode from "qrcode"
import { safe, wrap } from "./featureAnnouncementPdf.js"
import { CARDS_PER_SHEET, chunk, firstName } from "./welcomeCards.js"

const A4 = [595.28, 841.89]
const CARD_W = A4[0] / 2
const CARD_H = A4[1] / 2
const PAD_X = 20
const PAD_TOP = 22
const PAD_BOTTOM = 20
const INNER_W = CARD_W - PAD_X * 2
const QR = 92

const GOLD = rgb(0.753, 0.557, 0.263)   // #C08E43, the brand gold used on the HTML card
const TEXT = rgb(0.067, 0.094, 0.153)   // #111827
const DIM  = rgb(0.42, 0.45, 0.50)      // #6b7280
const SUB  = rgb(0.29, 0.33, 0.39)      // #4b5563
const RULE = rgb(0.90, 0.91, 0.92)      // #e5e7eb
const CUT  = rgb(0.61, 0.64, 0.69)      // #9ca3af

export const CARD_STEPS = [
  "Open the website, or scan the code with your phone camera.",
  "Enter your username and password, then tap Sign In.",
  "Choose your own new password. Keep it somewhere safe.",
]

/** Largest size from max down to min at which text fits width (min if none). */
export function fitSize(font, text, max, min, width) {
  for (let s = max; s > min; s -= 0.5) if (font.widthOfTextAtSize(text, s) <= width) return s
  return min
}

/** QR modules merged into horizontal runs: [{ x, y, w }] in module units, y from the top. */
export function qrRuns(text) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" })
  const n = modules.size
  const runs = []
  for (let r = 0; r < n; r++) {
    let c = 0
    while (c < n) {
      if (!modules.get(r, c)) { c++; continue }
      const start = c
      while (c < n && modules.get(r, c)) c++
      runs.push({ x: start, y: r, w: c - start })
    }
  }
  return { size: n, runs }
}

function drawCard(page, fonts, card, ox, oyTop, { site, helpLine }) {
  const { regular, bold } = fonts
  const left = ox + PAD_X
  let y = oyTop - PAD_TOP

  page.drawRectangle({
    x: ox, y: oyTop - CARD_H, width: CARD_W, height: CARD_H,
    borderColor: CUT, borderWidth: 0.75, borderDashArray: [4, 3],
  })

  const text = (str, font, size, color, x = left) => {
    y -= size
    page.drawText(str, { x, y, size, font, color })
  }

  text("ELEMENT HAPPENINGS", bold, 10, GOLD)
  y -= 9

  const hello = safe(bold, `Welcome, ${firstName(card.name) || card.name || ""}`)
  text(hello, bold, fitSize(bold, hello, 21, 13, INNER_W), TEXT)
  y -= 5

  if (card.house_number) {
    text(safe(regular, `House ${card.house_number}`), regular, 13, SUB)
    y -= 4
  }
  y -= 5

  text("WEBSITE", bold, 9.5, DIM)
  y -= 3
  const siteStr = safe(bold, site)
  text(siteStr, bold, fitSize(bold, siteStr, 15, 9, INNER_W), TEXT)
  y -= 10

  // Credentials (left) and QR code (right), tops aligned.
  const rowTop = y
  const credsW = INNER_W - QR - 12
  text("USERNAME", bold, 9.5, DIM)
  y -= 3
  const user = safe(bold, card.username)
  text(user, bold, fitSize(bold, user, 19, 10, credsW), TEXT)
  y -= 8
  text("PASSWORD", bold, 9.5, DIM)
  y -= 3
  text(safe(bold, card.pin), bold, 19, TEXT)
  const credsBottom = y

  const qrX = ox + CARD_W - PAD_X - QR
  const { size, runs } = qrRuns(card.loginUrl)
  const m = QR / size
  for (const r of runs) {
    page.drawRectangle({ x: qrX + r.x * m, y: rowTop - (r.y + 1) * m, width: r.w * m + 0.05, height: m + 0.05, color: TEXT })
  }
  const cap = "Scan to sign in"
  page.drawText(cap, { x: qrX + (QR - regular.widthOfTextAtSize(cap, 9)) / 2, y: rowTop - QR - 12, size: 9, font: regular, color: DIM })
  const qrBottom = rowTop - QR - 14

  y = Math.min(credsBottom, qrBottom) - 12
  const stepsTop = y

  // "Need help?" pinned to the bottom of the card, above a thin rule.
  const help = String(helpLine || "").trim()
  let helpTop = oyTop - CARD_H + PAD_BOTTOM
  let helpLines = []
  if (help) {
    helpLines = wrap(bold, 11.5, safe(bold, `Need help? ${help}`), INNER_W).slice(0, 3)
    helpTop += helpLines.length * 14 + 6
  }

  // Steps: numbered, hanging indent. Shrink the type if a long help line
  // would otherwise collide with them.
  const indent = 15
  let stepSize = 12.5, stepLines
  for (;;) {
    stepLines = CARD_STEPS.map(s => wrap(regular, stepSize, s, INNER_W - indent))
    const lh = stepSize * 1.3
    const h = stepLines.reduce((a, l) => a + l.length * lh, 0) + (CARD_STEPS.length - 1) * 3
    if (stepsTop - h >= helpTop + 4 || stepSize <= 9) break
    stepSize -= 0.5
  }
  const lh = stepSize * 1.3
  y = stepsTop
  stepLines.forEach((lines, i) => {
    page.drawText(`${i + 1}.`, { x: left, y: y - stepSize, size: stepSize, font: regular, color: TEXT })
    for (const line of lines) {
      page.drawText(line, { x: left + indent, y: y - stepSize, size: stepSize, font: regular, color: TEXT })
      y -= lh
    }
    y -= 3
  })

  if (helpLines.length) {
    let hy = helpTop - 2
    page.drawLine({ start: { x: left, y: hy }, end: { x: left + INNER_W, y: hy }, thickness: 0.75, color: RULE })
    hy -= 4
    for (const line of helpLines) {
      hy -= 11.5
      page.drawText(line, { x: left, y: hy, size: 11.5, font: bold, color: TEXT })
      hy -= 2.5
    }
  }
}

/**
 * cards: [{ name, house_number, username, pin, loginUrl }]
 * @returns {Promise<Uint8Array>}
 */
export async function buildWelcomeCardsPdf(cards, { site, helpLine } = {}) {
  const pdf = await PDFDocument.create()
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  }
  pdf.setTitle("Welcome cards")
  pdf.setAuthor("Element Happenings")
  pdf.setCreator("Element Happenings")

  const sheets = chunk(cards || [], CARDS_PER_SHEET)
  for (const sheet of sheets) {
    const page = pdf.addPage(A4)
    sheet.forEach((card, i) => {
      const ox = (i % 2) * CARD_W
      const oyTop = A4[1] - Math.floor(i / 2) * CARD_H
      drawCard(page, fonts, card, ox, oyTop, { site, helpLine })
    })
  }
  return pdf.save()
}
