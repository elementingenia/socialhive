// The welcome pack as a PDF (Iain, 2026-11-16). One letter per house, A4:
// Element Happenings header, "Welcome, <first names>", the admin's opening
// paragraph, a card for each resident in the house (the same card
// lib/welcomeCardsPdf.js prints, drawn smaller), then the three steps --
// open the website, put the app on the Home Screen, sign in -- a "Good to
// know" box, two tips and the "Need help?" line.
//
// Each card is also a link to that resident's sign-in page, because a QR
// code is no use to someone reading the letter on the phone they want to
// sign in on.
//
// Server-only (pdf-lib, pure JS). Relative imports only so
// tests/unit/welcomeCards.test.mjs can run it under plain Node. All wording
// lives in lib/welcomePack.js.
import { PDFDocument, StandardFonts, rgb, PDFString } from "pdf-lib"
import { safe, wrap, wrapParagraphs } from "./featureAnnouncementPdf.js"
import { drawCard, fitSize } from "./welcomeCardsPdf.js"
import {
  packIntroText, packGreeting, packTitle, PACK_STEP_TITLES, HOME_SCREEN_LEAD,
  IPHONE_STEPS, ANDROID_STEPS, SIGN_IN_STEPS, GOOD_TO_KNOW, PACK_TIPS,
} from "./welcomePack.js"

const A4 = [595.28, 841.89]
const M = 44
const W = A4[0] - M * 2
const FOOT = 40                      // space kept clear for the footer

export const PACK_CARD_W = 250
export const PACK_CARD_H = 234
const CARD_GAP = W - PACK_CARD_W * 2

const NAVY = rgb(0.122, 0.220, 0.392)   // #1F3864
const TEAL = rgb(0.051, 0.580, 0.533)   // #0d9488
const GOLD = rgb(0.753, 0.557, 0.263)   // #C08E43
const TEXT = rgb(0.067, 0.094, 0.153)
const SUB  = rgb(0.29, 0.33, 0.39)
const DIM  = rgb(0.42, 0.45, 0.50)
const RULE = rgb(0.86, 0.88, 0.90)
const TINT = rgb(0.91, 0.96, 0.95)
const WHITE = rgb(1, 1, 1)

const BODY = 11.5
const LH = 15.5

// ── Little step pictures, drawn with lines so no image files are needed ──
function drawIcon(page, kind, x, y, s = 18) {
  const t = 1.4
  const line = (x1, y1, x2, y2) => page.drawLine({ start: { x: x + x1 * s, y: y + y1 * s }, end: { x: x + x2 * s, y: y + y2 * s }, thickness: t, color: TEAL })
  if (kind === "dots") {
    for (const f of [0.2, 0.5, 0.8]) page.drawCircle({ x: x + s / 2, y: y + f * s, size: s * 0.085, color: NAVY })
  } else if (kind === "share") {
    // Three dots, then the Share icon: an open-topped box with an arrow up.
    for (const f of [0.15, 0.4, 0.65]) page.drawCircle({ x: x - s * 1.25 + f * s, y: y + s / 2, size: s * 0.075, color: NAVY })
    line(0.2, 0.55, 0.2, 0.05); line(0.2, 0.05, 0.8, 0.05); line(0.8, 0.05, 0.8, 0.55)
    line(0.5, 0.3, 0.5, 1); line(0.5, 1, 0.3, 0.8); line(0.5, 1, 0.7, 0.8)
  } else if (kind === "plus") {
    page.drawRectangle({ x: x + s * 0.05, y: y + s * 0.05, width: s * 0.9, height: s * 0.9, borderColor: TEAL, borderWidth: t })
    line(0.5, 0.25, 0.5, 0.75); line(0.25, 0.5, 0.75, 0.5)
  } else if (kind === "check") {
    page.drawCircle({ x: x + s / 2, y: y + s / 2, size: s * 0.46, borderColor: TEAL, borderWidth: t })
    line(0.28, 0.5, 0.44, 0.33); line(0.44, 0.33, 0.73, 0.68)
  }
}

function linkAnnotation(pdf, page, rect, url) {
  const ref = pdf.context.register(pdf.context.obj({
    Type: "Annot", Subtype: "Link", Rect: rect, Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
  }))
  page.node.addAnnot(ref)
}

/**
 * groups: [{ house, residents: [{ name, house_number, username, pin, loginUrl }] }]
 *   (lib/welcomePack.js groupByHouse). Every group starts on a new page.
 * logoPng: optional PNG bytes for the header; the letter is fine without.
 * @returns {Promise<Uint8Array>}
 */
export async function buildWelcomePackPdf(groups, { site, helpLine, intro, logoPng } = {}) {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const fonts = { regular, bold }
  const list = groups || []
  pdf.setTitle(list.length === 1 ? `Welcome pack - ${packTitle(list[0])}` : "Welcome packs")
  pdf.setAuthor("Element Happenings")
  pdf.setCreator("Element Happenings")

  let logo = null
  if (logoPng) { try { logo = await pdf.embedPng(logoPng) } catch { logo = null } }

  const siteStr = safe(regular, site || "")
  const help = String(helpLine || "").trim()
  let page = null, y = 0

  const newPage = () => {
    page = pdf.addPage(A4)
    y = A4[1] - M
    if (siteStr) page.drawText(siteStr, { x: (A4[0] - regular.widthOfTextAtSize(siteStr, 9.5)) / 2, y: 24, size: 9.5, font: regular, color: DIM })
  }
  // Keep a block together: start a new page if it will not fit.
  const need = (h) => { if (y - h < FOOT) newPage() }
  const lines = (arr, { font = regular, size = BODY, color = TEXT, x = M, lh = LH } = {}) => {
    for (const l of arr) { y -= lh; page.drawText(l, { x, y: y + (lh - size) * 0.35, size, font, color }) }
  }
  const para = (text, opts = {}) => {
    const size = opts.size || BODY, font = opts.font || regular
    const wrapped = wrapParagraphs(font, size, text, opts.width || W)
    need(wrapped.length * (opts.lh || LH))
    lines(wrapped, opts)
  }
  const stepHeading = (n, title) => {
    need(34 + LH * 3)
    y -= 12
    const label = safe(bold, `${n}. ${title}`)
    y -= 16
    page.drawText(label, { x: M, y, size: 15, font: bold, color: TEAL })
    y -= 6
  }
  const subHeading = (title) => {
    y -= 8
    y -= 13
    page.drawText(safe(bold, title), { x: M, y, size: 12.5, font: bold, color: NAVY })
    y -= 4
  }
  // Numbered rows: teal number badge, text, optional little picture on the right.
  const numbered = (steps) => {
    const iconW = 46, indent = 26
    steps.forEach((s, i) => {
      const text = typeof s === "string" ? s : s.text
      const icon = typeof s === "string" ? null : s.icon
      const wrapped = wrap(regular, BODY, safe(regular, text), W - indent - (icon === "share" ? iconW + 24 : icon ? iconW : 0))
      const h = Math.max(wrapped.length * LH, 20) + 5
      need(h)
      const top = y
      page.drawRectangle({ x: M, y: top - 18, width: 17, height: 17, color: TEAL })
      const num = String(i + 1)
      page.drawText(num, { x: M + (17 - bold.widthOfTextAtSize(num, 10.5)) / 2, y: top - 14, size: 10.5, font: bold, color: WHITE })
      lines(wrapped, { x: M + indent })
      if (icon) drawIcon(page, icon, M + W - 20, top - 20)
      y = top - h
    })
  }

  for (const group of list) {
    newPage()
    const residents = group.residents || []

    // ── Header ──
    const headH = 46
    let tx = M
    if (logo) {
      const lw = (logo.width / logo.height) * headH
      page.drawImage(logo, { x: M, y: y - headH, width: lw, height: headH })
      tx = M + lw + 10
    }
    page.drawText("Element", { x: tx, y: y - 15, size: 11, font: bold, color: GOLD })
    page.drawText("HAPPENINGS", { x: tx, y: y - 40, size: 25, font: bold, color: GOLD })
    const tag = "Getting started"
    page.drawText(tag, { x: M + W - bold.widthOfTextAtSize(tag, 14), y: y - 38, size: 14, font: bold, color: NAVY })
    y -= headH + 10
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 1.2, color: TEAL })

    // ── Welcome + opening paragraph ──
    y -= 14
    const hello = safe(bold, packGreeting(group))
    const helloSize = fitSize(bold, hello, 22, 13, W)
    y -= helloSize
    page.drawText(hello, { x: M, y, size: helloSize, font: bold, color: NAVY })
    if (group.house) {
      y -= 18
      page.drawText(safe(regular, `House ${group.house}`), { x: M, y, size: 13, font: regular, color: SUB })
    }
    y -= 8
    para(packIntroText(intro))

    // ── 1. Open the website: the cards ──
    stepHeading(1, PACK_STEP_TITLES[0])
    para(residents.length > 1
      ? "Each of you has your own card. Scan the code on your card with your phone camera. Reading this on your phone? Tap your card."
      : "Scan the code on your card with your phone camera. Reading this on your phone? Tap the card.")
    y -= 8
    for (let i = 0; i < residents.length; i += 2) {
      need(PACK_CARD_H + 26)
      const top = y
      residents.slice(i, i + 2).forEach((r, j) => {
        const ox = M + j * (PACK_CARD_W + CARD_GAP)
        drawCard(page, fonts, r, ox, top, { site, w: PACK_CARD_W, h: PACK_CARD_H, border: "box", steps: [] })
        const tap = "Tap here to sign in"
        const tw = bold.widthOfTextAtSize(tap, 11)
        const tapX = ox + (PACK_CARD_W - tw) / 2, tapY = top - PACK_CARD_H - 16
        page.drawText(tap, { x: tapX, y: tapY, size: 11, font: bold, color: TEAL })
        page.drawLine({ start: { x: tapX, y: tapY - 2 }, end: { x: tapX + tw, y: tapY - 2 }, thickness: 0.8, color: TEAL })
        if (r.loginUrl) linkAnnotation(pdf, page, [ox, tapY - 6, ox + PACK_CARD_W, top], r.loginUrl)
      })
      // A single card leaves the right half free: say what the card is for.
      if (residents.length - i === 1) {
        const save = y
        const colX = M + PACK_CARD_W + CARD_GAP + 16, colW = PACK_CARD_W - 16
        y = top - 16
        lines(["Your sign-in details"], { font: bold, size: 12.5, color: NAVY, x: colX })
        y -= 4
        lines(wrap(regular, BODY, "The card shows your username and a one-time password. It only works once: the first time you sign in you choose a password of your own.", colW), { x: colX })
        y -= 8
        lines(wrap(regular, BODY, "Keep this letter until you have signed in.", colW), { x: colX, color: SUB })
        y = save
      }
      y = top - PACK_CARD_H - 24
    }

    // ── 2. Home Screen ──
    stepHeading(2, PACK_STEP_TITLES[1])
    para(HOME_SCREEN_LEAD)
    need(40 + LH * 4); subHeading("iPhone and iPad (Safari)")
    numbered(IPHONE_STEPS)
    need(40 + LH * 3); subHeading("Android phones and tablets (Chrome)")
    numbered(ANDROID_STEPS)

    // ── 3. Sign in ──
    stepHeading(3, PACK_STEP_TITLES[2])
    numbered(SIGN_IN_STEPS)

    // ── Good to know ──
    const gk = GOOD_TO_KNOW.map(t => wrap(regular, BODY, safe(regular, t), W - 28))
    const gkH = 26 + gk.reduce((a, l) => a + l.length * LH + 4, 0) + 6
    need(gkH + 12)
    y -= 12
    page.drawRectangle({ x: M, y: y - gkH, width: W, height: gkH, color: TINT })
    page.drawRectangle({ x: M, y: y - gkH, width: 3, height: gkH, color: TEAL })
    const boxBottom = y - gkH
    y -= 20
    page.drawText("Good to know", { x: M + 14, y, size: 12.5, font: bold, color: NAVY })
    y -= 2
    for (const l of gk) { lines(l, { x: M + 14 }); y -= 4 }
    y = boxBottom

    // ── Tips ──
    for (const tip of PACK_TIPS) {
      const body = wrap(regular, BODY, safe(regular, tip.text), W)
      need(28 + body.length * LH)
      y -= 12
      y -= 13
      page.drawText(safe(bold, tip.title), { x: M, y, size: 12.5, font: bold, color: NAVY })
      y -= 3
      lines(body)
    }

    // ── Need help? ──
    if (help) {
      const hl = wrap(bold, 12, safe(bold, `Need help? ${help}`), W)
      need(22 + hl.length * 16)
      y -= 12
      page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.75, color: RULE })
      y -= 6
      lines(hl, { font: bold, size: 12, lh: 16 })
    }
  }

  return pdf.save()
}
