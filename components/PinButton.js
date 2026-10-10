"use client"
// 📌 Pin / Pinned toggle for My Stuff (migration 136, Iain 2026-10-10).
// One shared button so it looks and behaves the same on Contacts, Documents
// and Committee Documents. Stops the tap reaching the card underneath (a
// document card is itself a link).
export default function PinButton({ pinned, onToggle, label = "" }) {
  return (
    <button type="button"
      onClick={e => { e.preventDefault(); e.stopPropagation(); onToggle?.() }}
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${label} from My Stuff` : `Pin ${label} to My Stuff`}
      title={pinned ? "In My Stuff — tap to remove" : "Add to My Stuff"}
      style={{
        flexShrink: 0, fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: 6,
        border: `1px solid ${pinned ? "var(--teal)" : "var(--border)"}`,
        background: pinned ? "var(--teal)" : "var(--surface)", color: pinned ? "#fff" : "var(--text)",
        cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
      }}>
      📌 {pinned ? "Pinned" : "Pin"}
    </button>
  )
}
