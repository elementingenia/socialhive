"use client"
import { useState } from "react"

// Shared "N lines, then fade + Read more / Show less" text block.
// Used for anything that might run long: book summaries, event descriptions, etc.
// Pass `html` to render rich text (e.g. from RichEditor via bbToHtml) instead of plain text.
export default function ExpandableText({ text, html, lineHeight = 1.6, fontSize = 13, maxLines = 4, colour = "var(--purple)" }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return null
  const maxH = maxLines * lineHeight * fontSize
  const bodyStyle = {
    fontSize, color: "var(--text-dim)", lineHeight, margin: 0,
    maxHeight: expanded ? "none" : maxH,
    overflow: "hidden",
    transition: "max-height 0.3s ease",
  }
  return (
    <div style={{ position: "relative" }}>
      {html
        ? <div style={bodyStyle} dangerouslySetInnerHTML={{ __html: text }} />
        : <p style={bodyStyle}>{text}</p>}
      {!expanded && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: 48, background: "linear-gradient(transparent, var(--surface))",
          display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 4,
        }}>
          <button onClick={e => { e.stopPropagation(); setExpanded(true) }}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
              color: colour, textDecoration: "underline", fontFamily: "inherit" }}>
            Read more ▾
          </button>
        </div>
      )}
      {expanded && (
        <button onClick={e => { e.stopPropagation(); setExpanded(false) }}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
            color: colour, textDecoration: "underline", fontFamily: "inherit", marginTop: 4, display: "block" }}>
          Show less ▴
        </button>
      )}
    </div>
  )
}
