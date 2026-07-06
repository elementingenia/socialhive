"use client"

// Shared 1-10 rating grid + "Not interested / Can't wait" labels.
//
// Previously this exact grid was hand-copied into 4 separate places — Book
// Club's suggestions swiper, Book Club's inline "Your Rating" card, Movies
// Suggestions' fast-vote swiper, Movies Home's "Rate a Film" swiper — plus a
// 5th spot (the "View & Rate" detail modal on Suggestions) that never had
// the labels at all. Each copy drifted independently: some had arrows and
// (1)/(10) counts, some didn't, one had none. One shared component here
// means a style change only ever needs to happen once, and every surface
// stays in sync automatically.
//
// accentColor lets each hub keep its own brand colour (purple for Book Club,
// teal for Movies) for the selected/current score, while the label text,
// position, and grid spacing stay identical everywhere — matching the
// project's established cross-hub pattern (same structure, hub-specific
// colour).
export default function VoteScoreGrid({ current = null, onVote, disabled = false, accentColor = "var(--teal)" }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "var(--text-dim)", marginBottom: "0.35rem" }}>
        <span>← Not interested (1)</span><span>(10) Can&apos;t wait! →</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.35rem" }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
          <button key={n} onClick={() => onVote(n)} disabled={disabled}
            style={{
              padding: "0.5rem 0", borderRadius: "10px",
              border: current === n ? `2px solid ${accentColor}` : "1.5px solid var(--border)",
              background: current === n ? accentColor : "var(--surface)",
              color: current === n ? "#fff" : "var(--text)",
              fontSize: "0.9rem", fontWeight: 700, fontFamily: "inherit",
              cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
            }}>
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}
