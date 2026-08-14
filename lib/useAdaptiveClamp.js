"use client"
import { useLayoutEffect, useState } from "react"

// Computes a maxLines value for ExpandableText based on how much vertical
// room is actually left in a height-capped, internally-scrolling sheet,
// instead of a fixed line count applied regardless of content length.
//
// Why this exists (2026-08-13, Book/DVD detail sheets): a fixed maxLines
// was wrong in both directions -- a short blurb that would fully fit inside
// the sheet's own maxHeight was still getting truncated with a needless
// "Read more", while the sheet itself was shrink-wrapping to the *clamped*
// height rather than growing toward maxHeight first. Iain's spec, 2026-08-13:
// the sheet should grow to fit content up to its maxHeight, and only once
// content still doesn't fit at that point should it clamp and show Read more.
//
// Why this measures the scrollable body, not the sheet itself: the sheet's
// body has overflow-y:auto (so long content scrolls internally rather than
// pushing Borrow off-screen -- see the sticky footer fix). That means the
// SHEET's own scrollHeight is useless for "does the unclamped content fit":
// once content overflows, the body's overflow:auto absorbs it and clips the
// sheet's rendered height at maxHeight, so sheet.scrollHeight reads as
// "fits" even when it doesn't. The body element itself doesn't have this
// problem -- an overflow:auto element's scrollHeight always reports its
// full, unclipped content height regardless of what's visible.
//
// Two-pass measurement, both effects run before the browser paints so
// there's no visible flash:
//   1. Render the text fully unclamped (maxLines=null) so the body lays
//      out at its natural, un-truncated height.
//   2. Measure: how much height is available for the body (sheet maxHeight
//      minus the header/footer, which are flexShrink:0 and always render
//      at full size)? Does the body's natural height fit in that? If yes,
//      leave text unclamped -- no Read more at all. If not, work out how
//      many lines of text fit in whatever's left after the body's other
//      content (author row, ISBN, genre chips, rating, etc.) and clamp to
//      that.
//
// sheetRef    -- the height-capped container (has maxHeight in its computed style)
// bodyRef     -- the scrollable flex:1 / overflow-y:auto child within it
// textWrapRef -- wraps the ExpandableText call; used to measure the text
//                block's own natural (unclamped) height in isolation
// deps        -- re-measure when these change (e.g. [book.id, book.summary])
export function useAdaptiveClamp(sheetRef, bodyRef, textWrapRef, { fontSize, lineHeight }, deps) {
  const [maxLines, setMaxLines] = useState(null)
  const [pass, setPass] = useState("measure") // 'measure' (unclamped, mid-measurement) | 'done'

  useLayoutEffect(() => {
    setPass("measure")
    setMaxLines(null)
  }, deps)

  useLayoutEffect(() => {
    if (pass !== "measure") return
    const sheetEl = sheetRef.current
    const bodyEl  = bodyRef.current
    const textEl  = textWrapRef.current
    if (!sheetEl || !bodyEl || !textEl) { setPass("done"); return }

    const maxHeightPx = parseFloat(getComputedStyle(sheetEl).maxHeight)

    let nonBodyHeight = 0
    for (const child of sheetEl.children) {
      if (child !== bodyEl) nonBodyHeight += child.getBoundingClientRect().height
    }
    const availableForBody = Math.max(0, (maxHeightPx || 0) - nonBodyHeight)
    const bodyNatural = bodyEl.scrollHeight

    if (!maxHeightPx || bodyNatural <= availableForBody) {
      setMaxLines(null)
    } else {
      const textNatural  = textEl.scrollHeight
      const otherInBody  = bodyNatural - textNatural
      const lineHeightPx = fontSize * lineHeight
      const availableForText = Math.max(lineHeightPx, availableForBody - otherInBody)
      const lines = Math.max(1, Math.floor(availableForText / lineHeightPx))
      setMaxLines(lines)
    }
    setPass("done")
  })

  return maxLines
}
