// lib/attachmentLimits.js
//
// A real, ENFORCED file-size cap for resident-uploaded attachments (Iain,
// 2026-09-08: "should we put a hard reject upfront on file sizes... better
// UX and healthier in the long run to keep data usage minimal").
//
// 10MB, not the 4MB first floated, for a concrete reason found while
// scoping this: Info > Documents' own upload form already displays
// "PDF, Word, or image — max 10MB" -- but nothing anywhere, client or
// server, ever actually checked that. It was a promise with nothing behind
// it. Reusing that already-shown number (rather than introducing a THIRD,
// different one) means no existing UI copy needs to change, and 10MB also
// matches the limit already set on the separate `event-menus` Storage
// bucket (see app/api/events/menu/route.js) -- so this isn't a new,
// invented ceiling, just the first time an existing one is actually
// enforced. 4MB would reject some entirely legitimate scanned/multi-page
// meeting-minutes PDFs; happy to tighten it if Iain would rather.
//
// Storage capacity was never the real constraint here (checked directly,
// 2026-08-23: total usage across every bucket is ~13MB against a 1GB
// free-tier cap) -- the actual cost lever is monthly EGRESS, which is a
// function of how often a file gets re-downloaded, not just its size, and
// every upload route already sets a long Storage cache-control header for
// that reason (see lib/imageResize.js's MAX_AGE_SECONDS). This cap is
// primarily a UX fix (fail fast with a clear message, not a multi-minute
// stall or a cryptic platform error) -- keeping typical file sizes down is
// a secondary, real but smaller, benefit on top of that.
export const MAX_ATTACHMENT_MB = 10
export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024

export function tooLargeMessage(file) {
  const mb = (file.size / (1024 * 1024)).toFixed(1)
  return `That file is ${mb}MB — the limit is ${MAX_ATTACHMENT_MB}MB. Try compressing it or splitting it into smaller files.`
}
