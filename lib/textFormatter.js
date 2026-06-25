// ── Shared text formatting utilities ─────────────────────────────────────────
// Tags: [b]bold[/b]  [i]italic[/i]  [u]underline[/u]  [c1]hub-colour[/c1]  [c2]grey[/c2]

import React from "react"

/**
 * Wraps the selected range in a textarea with [tag]…[/tag].
 * Returns the new full string — caller sets it as the new value.
 */
export function wrapTag(value, selStart, selEnd, tag) {
  const before   = value.substring(0, selStart)
  const selected = value.substring(selStart, selEnd)
  const after    = value.substring(selEnd)
  return before + `[${tag}]` + selected + `[/${tag}]` + after
}

/**
 * Parse BBCode tags into a token list.
 * Returns: Array<{ type: 'text'|'b'|'i'|'u'|'c1'|'c2', content: string }>
 */
export function parseText(text) {
  if (!text) return []
  const tokens = []
  const pattern = /\[(b|i|u|c1|c2)\]([\s\S]*?)\[\/\1\]/g
  let lastIndex = 0
  let match
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) tokens.push({ type: "text", content: text.slice(lastIndex, match.index) })
    tokens.push({ type: match[1], content: match[2] })
    lastIndex = pattern.lastIndex
  }
  if (lastIndex < text.length) tokens.push({ type: "text", content: text.slice(lastIndex) })
  return tokens
}

/**
 * React component that renders formatted text with BBCode tags.
 * c1Colour: the hub colour (e.g. 'var(--teal)')
 * c2Colour: the muted colour (defaults to 'var(--text-dim)')
 */
export function FormattedText({ text, c1Colour = "var(--teal)", c2Colour = "var(--text-dim)" }) {
  if (!text) return null
  const tokens = parseText(text)
  return React.createElement(
    React.Fragment,
    null,
    tokens.map((t, i) => {
      switch (t.type) {
        case "b":  return React.createElement("strong", { key: i }, t.content)
        case "i":  return React.createElement("em", { key: i }, t.content)
        case "u":  return React.createElement("span", { key: i, style: { textDecoration: "underline" } }, t.content)
        case "c1": return React.createElement("span", { key: i, style: { color: c1Colour } }, t.content)
        case "c2": return React.createElement("span", { key: i, style: { color: c2Colour } }, t.content)
        default:   return React.createElement("span", { key: i }, t.content)
      }
    })
  )
}
