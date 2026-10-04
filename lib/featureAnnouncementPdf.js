// Builds the daily "New Features" PDF (Scope_Answered decision 1: one PDF
// per day). One fixed template so every announcement looks the same:
// Element Happenings header, the date, then per feature -- title, one-line
// summary, What it does, How to use it (numbered), Where to find it -- and a
// consistent footer with page numbers. Large type for a 55+ audience; plain
// Helvetica, no emoji (the standard PDF fonts can't draw them).
//
// Server-only (pdf-lib, pure JS -- works on Vercel). Relative imports only so
// tests/unit/newFeatures.test.mjs can run it under plain Node.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { featureDateLabel } from "./newFeatures.js"

const A4 = [595.28, 841.89]
const MARGIN = 56
const TEAL = rgb(0.051, 0.580, 0.533)      // #0d9488, the app's teal
const NAVY = rgb(0.106, 0.165, 0.290)
const TEXT = rgb(0.13, 0.13, 0.13)
const DIM  = rgb(0.38, 0.38, 0.38)

const SIZES = { brand: 13, docTitle: 24, date: 13, featTitle: 18, summary: 14, heading: 13, body: 13, footer: 10 }

// The standard fonts only cover WinAnsi. Swap the common smart characters
// for plain ones and drop anything else the font can't draw, so a stray
// emoji in a draft can never break the cron's PDF build.
function safe(font, text) {
  const swapped = String(text || "")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/…/g, "...").replace(/\u00A0/g, " ")
    .replace(/[\r\t]/g, " ")
  let out = ""
  for (const ch of swapped) {
    try { font.encodeText(ch); out += ch } catch { /* not drawable -- skip */ }
  }
  return out.replace(/ {2,}/g, " ")
}

function wrap(font, size, text, width) {
  const lines = []
  for (const para of String(text).split("\n")) {
    const words = para.split(" ").filter(Boolean)
    let line = ""
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue }
      if (line) lines.push(line)
      // A single word longer than the line (a URL): hard-break it.
      let word = w
      while (font.widthOfTextAtSize(word, size) > width && word.length > 1) {
        let cut = word.length - 1
        while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > width) cut--
        lines.push(word.slice(0, cut)); word = word.slice(cut)
      }
      line = word
    }
    lines.push(line)
  }
  return lines
}

/**
 * @param {{ dateStr: string, features: Array<{title, summary, what_it_does, how_to_use, where_to_find}> }} input
 * @returns {Promise<Uint8Array>}
 */
export async function buildFeatureAnnouncementPdf({ dateStr, features = [] }) {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const title = `New Features — ${featureDateLabel(dateStr)}`
  pdf.setTitle(safe(regular, title))
  pdf.setAuthor("Element Happenings")
  pdf.setCreator("Element Happenings")

  const width = A4[0] - MARGIN * 2
  const pages = []
  let page, y

  function newPage() {
    page = pdf.addPage(A4)
    pages.push(page)
    y = A4[1] - MARGIN
    page.drawText("Element Happenings", { x: MARGIN, y: y - SIZES.brand, size: SIZES.brand, font: bold, color: TEAL })
    y -= SIZES.brand + 8
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 1.5, color: TEAL })
    y -= 22
  }
  function ensure(h) { if (y - h < MARGIN + 30) newPage() }

  function text(str, { font = regular, size = SIZES.body, color = TEXT, gap = 4, indent = 0 } = {}) {
    const lines = wrap(font, size, safe(font, str), width - indent)
    const lh = size * 1.35
    for (const line of lines) {
      ensure(lh)
      page.drawText(line, { x: MARGIN + indent, y: y - size, size, font, color })
      y -= lh
    }
    y -= gap
  }

  newPage()
  text(title, { font: bold, size: SIZES.docTitle, color: NAVY, gap: 2 })
  const intro = features.length === 1
    ? "Here's what's new in the app, and how to use it."
    : `Here are the ${features.length} new things in the app, and how to use them.`
  text(intro, { size: SIZES.date, color: DIM, gap: 14 })

  // Contents list at the top (Iain, 2026-10-04): every feature in this
  // document, numbered, so a reader sees at a glance what's inside.
  text("In this update", { font: bold, size: SIZES.heading, color: NAVY, gap: 2 })
  features.forEach((f, i) => {
    const lead = `${i + 1}.`
    ensure(SIZES.summary * 1.35)
    page.drawText(lead, { x: MARGIN, y: y - SIZES.summary, size: SIZES.summary, font: bold, color: TEAL })
    text(f.title, { size: SIZES.summary, indent: 24, gap: 2 })
  })
  y -= 14

  // Each feature starts with a numbered badge matching the contents list,
  // under a clear divider, so it's obvious where one ends and the next begins.
  const BADGE = 13   // circle radius
  features.forEach((f, i) => {
    ensure(SIZES.featTitle * 4)   // keep the divider + title with what follows
    page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: A4[0] - MARGIN, y: y + 4 }, thickness: 1.5, color: TEAL })
    y -= 14
    const cy = y - SIZES.featTitle * 0.6
    page.drawCircle({ x: MARGIN + BADGE, y: cy, size: BADGE, color: TEAL })
    const num = String(i + 1)
    const nw = bold.widthOfTextAtSize(num, 14)
    page.drawText(num, { x: MARGIN + BADGE - nw / 2, y: cy - 5, size: 14, font: bold, color: rgb(1, 1, 1) })
    text(f.title, { font: bold, size: SIZES.featTitle, color: TEAL, gap: 4, indent: BADGE * 2 + 10 })
    if (f.summary) text(f.summary, { size: SIZES.summary, gap: 10 })
    if (f.what_it_does) {
      ensure(SIZES.heading * 3)
      text("What it does", { font: bold, size: SIZES.heading, color: NAVY, gap: 1 })
      text(f.what_it_does, { gap: 10 })
    }
    const steps = Array.isArray(f.how_to_use) ? f.how_to_use.filter(Boolean) : []
    if (steps.length) {
      ensure(SIZES.heading * 3)
      text("How to use it", { font: bold, size: SIZES.heading, color: NAVY, gap: 1 })
      steps.forEach((s, n) => {
        const lead = `${n + 1}.`
        ensure(SIZES.body * 1.35)
        page.drawText(lead, { x: MARGIN, y: y - SIZES.body, size: SIZES.body, font: bold, color: TEXT })
        text(s, { indent: 22, gap: 3 })
      })
      y -= 7
    }
    if (f.where_to_find) {
      ensure(SIZES.heading * 3)
      text("Where to find it", { font: bold, size: SIZES.heading, color: NAVY, gap: 1 })
      text(f.where_to_find, { gap: 10 })
    }
  })

  const total = pages.length
  pages.forEach((p, i) => {
    const label = `Element Happenings · New Features · Page ${i + 1} of ${total}`
    const safeLabel = safe(regular, label)
    const w = regular.widthOfTextAtSize(safeLabel, SIZES.footer)
    p.drawText(safeLabel, { x: (A4[0] - w) / 2, y: MARGIN - 24, size: SIZES.footer, font: regular, color: DIM })
  })

  return pdf.save()
}
