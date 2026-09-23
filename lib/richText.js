// Shared "is this stored text HTML?" check (BUG-065, 2026-09-24).
//
// RichEditor saves contentEditable innerHTML. When a resident types plain
// text with no formatting, innerHTML has NO tags but still carries HTML
// entities -- most often "&nbsp;" (a double space or a trailing space), also
// "&amp;", "&lt;" etc. The old check at every render site was a tag-only
// regex, so entity-only text fell through to the plain-text branch and the
// entity showed up literally ("...entirely. &nbsp;Based on..."). Treat a
// real HTML entity as HTML too so it renders via innerHTML and decodes.
//
// A bare "&" (e.g. "Fish & chips") is not an entity and stays plain text.
const TAG_RE = /<[a-z][\s\S]*>/i
const ENTITY_RE = /&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i

export function isHtmlContent(text) {
  if (!text || typeof text !== "string") return false
  return TAG_RE.test(text) || ENTITY_RE.test(text)
}
