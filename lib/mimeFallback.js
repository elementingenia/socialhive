// lib/mimeFallback.js
//
// Root cause (evidence, 2026-09-08): a resident reported "The string did
// not match the expected pattern." on the Documents upload form when
// choosing a .docx file. That exact wording is not one of this app's own
// error strings (grepped the whole repo for it -- zero matches) -- it's
// the verbatim TypeError Node's fetch/undici implementation throws when a
// header value fails its validation regex. app/api/info/documents/route.js
// passed `contentType: file.type` straight through to
// supabaseAdmin.storage.upload()'s options (which become request headers)
// with no fallback -- and mobile Safari is well known to hand back an
// EMPTY string for `file.type` on Word documents specifically (PDFs and
// images almost always report a correct MIME; .doc/.docx frequently
// don't). An empty Content-Type header value is what undici rejected,
// producing exactly the message reported.
//
// Fix: whenever the browser doesn't give us a usable MIME type, derive one
// from the file extension instead of passing the blank/garbage value
// through to Storage.
const EXT_MIME = {
  pdf:  "application/pdf",
  doc:  "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png:  "image/png",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
}

// `reportedType` is whatever the browser put in File.type (often "" for
// docx on iOS Safari). Falls back to a guess from the filename extension,
// and finally to a generic binary type so we never hand Storage an empty
// string.
export function resolveContentType(reportedType, fileName) {
  if (reportedType && reportedType.trim()) return reportedType
  const ext = (fileName || "").split(".").pop()?.toLowerCase()
  return EXT_MIME[ext] || "application/octet-stream"
}
