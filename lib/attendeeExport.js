// lib/attendeeExport.js
//
// Shared "export attendee list as PDF" helper (2026-09-11). Iain asked for
// admin/Owner/EC to be able to export an event's attendee list as a PDF
// "throughout any event anywhere (where an export option has not already
// been built)".
//
// This app has never had a PDF-generation library or server-side PDF
// rendering anywhere -- every existing "export as PDF" surface (the Help
// Guide, Survey results) is just window.print() on the live page, relying
// on the browser's own Print > Save as PDF. Rather than add a new
// dependency for this, the same zero-dependency convention is reused here,
// just scoped to a dedicated print-only window built from the attendee
// data (not the whole page), so no unrelated chrome/buttons/forms ends up
// in the exported PDF.
//
// sections: [{ heading, rows: [{ name, seats, note }] }]
export function exportAttendeeListPdf({ eventTitle, eventSubtitle, sections }) {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ))

  const win = typeof window !== "undefined" ? window.open("", "_blank", "width=850,height=1000") : null
  if (!win) return false

  const realSections = (sections || []).filter(s => s.rows && s.rows.length > 0)
  const totalSeats = realSections.reduce((sum, s) => sum + s.rows.reduce((n, r) => n + (Number(r.seats) || 0), 0), 0)

  const sectionsHtml = realSections.map(s => `
    <h2>${esc(s.heading)} <span class="count">(${s.rows.length})</span></h2>
    <table>
      <thead><tr><th>Name</th><th>Seats</th><th>Notes</th></tr></thead>
      <tbody>
        ${s.rows.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.seats ?? "")}</td><td>${esc(r.note ?? "")}</td></tr>`).join("")}
      </tbody>
    </table>
  `).join("")

  const exportedAt = new Date().toLocaleString("en-AU", {
    timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  })

  win.document.open()
  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(eventTitle)} — Attendees</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111827; padding: 32px; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .subtitle { font-size: 13px; color: #6b7280; margin-bottom: 4px; }
  .total { font-size: 13px; color: #374151; font-weight: 600; margin-bottom: 20px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #4b5563; margin: 22px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  h2 .count { text-transform: none; letter-spacing: normal; font-weight: 400; color: #9ca3af; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #f3f4f6; }
  th { color: #6b7280; font-weight: 600; }
  .empty { font-size: 13px; color: #6b7280; font-style: italic; }
  .meta { font-size: 11px; color: #9ca3af; margin-top: 28px; }
  .print-btn { margin-bottom: 20px; padding: 8px 16px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1px solid #d1d5db; background: #f9fafb; cursor: pointer; }
  @media print { .print-btn { display: none } body { padding: 0 24px } }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨 Print / Save as PDF</button>
  <h1>${esc(eventTitle)}</h1>
  ${eventSubtitle ? `<div class="subtitle">${esc(eventSubtitle)}</div>` : ""}
  <div class="total">${totalSeats} seat${totalSeats !== 1 ? "s" : ""} total</div>
  ${sectionsHtml || '<p class="empty">No attendees yet.</p>'}
  <div class="meta">Exported ${esc(exportedAt)}</div>
</body>
</html>`)
  win.document.close()

  // document.write()'d windows don't reliably fire a normal load event in
  // every browser before content is painted, so nudge print shortly after
  // as well as on load -- calling window.print() twice is harmless (the
  // second call is a no-op once a print dialog is already open/closed).
  const tryPrint = () => { try { win.focus() } catch (e) { /* noop */ } }
  win.onload = tryPrint
  setTimeout(tryPrint, 250)

  return true
}

// Shared "export payment reconciliation as PDF" helper (2026-09-15, Iain,
// item #3: "Reconciliation needs a PDF print out of the info and
// consolidated list of paid by booking, Paid grouped, Unpaid Grouped,
// Partial Grouped and Refunds last.").
//
// UPDATED 2026-09-16 (Iain): this used to open a bare `window.open("",
// "_blank")` popup with nothing but a "Print / Save as PDF" button -- the
// same "no way back" shape app/(app)/committee/attachment/page.js was
// fixed for on 2026-09-15 (see that file's header comment), and this was
// ALSO a real popup, so it carried the exact "check your pop-up blocker"
// failure this project already knows to avoid. Iain: "The same design
// functions need to be applied to the reconciliation export ...
// Close/Download/Open in Browser options etc in EXACTLY the same
// functions and design as implemented for the committee update document
// reading." Rather than approximate that toolbar a second time, this now
// builds the exact same report HTML as before, wraps it in a Blob, and
// hands the resulting object: URL to the shared in-app viewer
// (components/DocumentViewer.js, via app/(app)/documents/view/page.js) --
// the identical Close/Download/Open-in-browser chrome Committee attachments
// use, reached with a normal client-side route change (no new window/tab,
// so no popup blocker to trip). The report's own "Print / Save as PDF"
// button is kept inside the iframe'd content for parity with the existing
// convention (this app has never had a PDF-generation library -- every
// "export as PDF" surface, including this one, still relies on the
// browser's own Print > Save as PDF).
//
// Requires a Next.js `router` (from next/navigation's useRouter()) since
// this is now a same-document SPA navigation, not a new window -- the
// Blob URL only stays valid because the document that created it is never
// unloaded. `hubColour` tints the viewer's Close button to match the hub/
// club this reconciliation came from (e.g. "var(--terracotta)") -- a
// var(--token) is fine here, unlike `summaryLines`' colours below, because
// this one only decorates the real app page's own toolbar (which has the
// app's CSS custom properties in scope), never the generated report
// content itself.
//
// summaryLines: [{ label, value, colour }] -- rendered as the Expected/
// Collected/Outstanding/Refunds-due row at the top, mirroring the on-screen
// reconciliation summary. `colour` here must also be a literal CSS colour
// (e.g. "#166534"), never a var(--token) -- the report content is a fresh
// document with none of the app's own CSS custom properties defined on it.
// groups: [{ heading, rows: [{ name, seats, amount }] }] -- pass them in
// the exact print order: Paid, Unpaid, Partial, then Refunds last, per
// Iain's explicit ordering.
export function exportPaymentReconciliationPdf({ eventTitle, eventSubtitle, summaryLines, groups, router, hubColour }) {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ))

  if (typeof window === "undefined" || !router) return false

  const realGroups = (groups || []).filter(g => g.rows && g.rows.length > 0)

  const summaryHtml = (summaryLines || []).length
    ? `<div class="summary">${summaryLines.map(s => `<span>${esc(s.label)} <strong${s.colour ? ` style="color:${esc(s.colour)}"` : ""}>${esc(s.value)}</strong></span>`).join("")}</div>`
    : ""

  const groupsHtml = realGroups.map(g => `
    <h2>${esc(g.heading)} <span class="count">(${g.rows.length})</span></h2>
    <table>
      <thead><tr><th>Name</th><th>Seats</th><th>Amount</th></tr></thead>
      <tbody>
        ${g.rows.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.seats ?? "")}</td><td>${esc(r.amount ?? "")}</td></tr>`).join("")}
      </tbody>
    </table>
  `).join("")

  const exportedAt = new Date().toLocaleString("en-AU", {
    timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  })

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(eventTitle)} — Payment Reconciliation</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111827; padding: 32px; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .subtitle { font-size: 13px; color: #6b7280; margin-bottom: 12px; }
  .summary { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: #374151; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 1px solid #e5e7eb; }
  .summary strong { color: #111827; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #4b5563; margin: 22px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  h2 .count { text-transform: none; letter-spacing: normal; font-weight: 400; color: #9ca3af; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #f3f4f6; }
  th { color: #6b7280; font-weight: 600; }
  .empty { font-size: 13px; color: #6b7280; font-style: italic; }
  .meta { font-size: 11px; color: #9ca3af; margin-top: 28px; }
  .print-btn { margin-bottom: 20px; padding: 8px 16px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1px solid #d1d5db; background: #f9fafb; cursor: pointer; }
  @media print { .print-btn { display: none } body { padding: 0 24px } }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨 Print / Save as PDF</button>
  <h1>${esc(eventTitle)}</h1>
  ${eventSubtitle ? `<div class="subtitle">${esc(eventSubtitle)}</div>` : ""}
  ${summaryHtml}
  ${groupsHtml || '<p class="empty">No bookings yet.</p>'}
  <div class="meta">Exported ${esc(exportedAt)}</div>
</body>
</html>`

  const blob = new Blob([html], { type: "text/html" })
  const blobUrl = URL.createObjectURL(blob)
  const fileName = `${eventTitle || "Event"} - Payment Reconciliation.html`
  const q = new URLSearchParams({
    url: blobUrl,
    name: fileName,
    ...(hubColour ? { color: hubColour } : {}),
  })
  router.push(`/documents/view?${q.toString()}`)

  return true
}
