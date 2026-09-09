// lib/attachmentLimits.js
//
// A real, ENFORCED file-size cap for resident-uploaded attachments (Iain,
// 2026-09-08: "should we put a hard reject upfront on file sizes... better
// UX and healthier in the long run to keep data usage minimal").
//
// First shipped (PR #101) at 10MB, reusing the number Info > Documents'
// upload form already displayed ("max 10MB") with nothing actually
// enforcing it. Iain reviewed that in production and asked to go with his
// originally-floated 4MB instead (2026-09-09): a deliberately tighter,
// longer-term-prudent ceiling, residents can be steered to shrink files
// where needed. Set here as the one place this changes -- UI copy in
// app/(app)/committee/page.js and app/(app)/info/documents/page.js reads
// this same limit, not a separate hardcoded number.
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
export const MAX_ATTACHMENT_MB = 4
export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024

export function tooLargeMessage(file) {
  const mb = (file.size / (1024 * 1024)).toFixed(1)
  return `That file is ${mb}MB — the limit is ${MAX_ATTACHMENT_MB}MB. Try compressing it or splitting it into smaller files.`
}
