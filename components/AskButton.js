"use client"
// Ask a question -- a small ? button that sits just above the Find button on
// every page (Iain, 2026-10-10: "Drop Ask a Question and put it as a little ?
// icon sitting in its own sticky above the Search option. Colour a muted grey
// and low opacity but clear enough to be visible"). It replaces the Home
// "Ask a question" tile, whose slot My Stuff now takes. Opens the same
// AskQuestion picker the tile did (pickTarget: choose who to ask).
//
// Mounted once in app/(app)/layout.js next to FindButton. Find is hidden on
// Info pages, so there this drops into Find's spot rather than floating
// above an empty gap.
import { usePathname } from "next/navigation"
import AskQuestion from "@/components/AskQuestion"
import { isInfoPath } from "@/lib/newFeatures"

const FIND_BOTTOM = 82     // FindButton's offset above BottomNav (px)
const FIND_SIZE = 52
const GAP = 10
const SIZE = 44            // minimum comfortable tap target

export default function AskButton() {
  const pathname = usePathname()
  const bottom = isInfoPath(pathname) ? FIND_BOTTOM : FIND_BOTTOM + FIND_SIZE + GAP
  return (
    <AskQuestion pickTarget colour="var(--amber-dark)" trigger={(open) => (
      <button onClick={open} aria-label="Ask a question" title="Ask a question"
        style={{
          position: "fixed",
          right: 16 + (FIND_SIZE - SIZE) / 2,
          bottom: `calc(${bottom}px + env(safe-area-inset-bottom, 0px))`,
          width: SIZE, height: SIZE, borderRadius: "50%",
          background: "#6b7280", color: "#fff", opacity: 0.6,
          border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, fontWeight: 800, fontFamily: "inherit", lineHeight: 1,
          cursor: "pointer", zIndex: 90,
        }}>?</button>
    )} />
  )
}
