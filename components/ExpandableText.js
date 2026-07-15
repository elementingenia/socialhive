"use client"
import { useState, useRef, useEffect } from "react"

// Shared "N lines, then fade + Read more / Show less" text block.
// Used for anything that might run long: book summaries, event descriptions, etc.
// Pass `html` to render rich text (e.g. from RichEditor via bbToHtml) instead of plain text.
//
// Collapsed state uses native -webkit-line-clamp rather than a JS pixel-height
// guess (the old `maxLines * lineHeight * fontSize` math). That guess broke
// specifically on iPad: WebKit auto-inflates rendered font size on a
// narrow-column-on-a-wide-viewport layout (its text-size-adjust heuristic),
// so the *actual* rendered line height no longer matched the *nominal*
// fontSize the height was computed from, and the fixed-height fade overlay
// ended up covering more of the box than intended -- as little as line 1.
// line-clamp is measured by the browser against real rendered line boxes, so
// it's correct regardless of any font-size-adjust behaviour. The fade/Read
// more affordance now only appears when the content actually overflows past
// maxLines (measured via scrollHeight vs clientHeight), not unconditionally.
export default function ExpandableText({ text, html, lineHeight = 1.6, fontSize = 13, maxLines = 2, colour = "var(--purple)" }) {
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    setOverflowing(el.scrollHeight - el.clientHeight > 1)
  }, [text, maxLines, fontSize, lineHeight])

  if (!text) return null

  const baseStyle = { fontSize, color: "var(--text-dim)", lineHeight, margin: 0 }
  const bodyStyle = expanded ? baseStyle : {
    ...baseStyle,
    display: "-webkit-box",
    WebkitLineClamp: maxLines,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  }

  // Fade sized to the tail end of one line, not a fixed pixel guess that
  // could span (and obscure) multiple lines of a short clamp.
  const fadeHeight = Math.round(fontSize * lineHeight * 0.8)

  return (
    <div style={{ position: "relative" }}>
      {html
        ? <div ref={ref} style={bodyStyle} dangerouslySetInnerHTML={{ __html: text }} />
        : <p ref={ref} style={bodyStyle}>{text}</p>}
      {!expanded && overflowing && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: fadeHeight, background: "linear-gradient(transparent, var(--surface))",
          display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 2,
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
