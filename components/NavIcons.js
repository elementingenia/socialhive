"use client"

// Custom SVG icon set for Social Hive nav.
// All icons use a 70×70 internal coordinate system.
// fill="currentColor" inherits the parent button's CSS `color` — no colour props needed.

const VB = "0 0 70 70"

export function HomeIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox={VB} aria-hidden="true">
      <path fillRule="evenodd" fill="currentColor"
        d="M 35 3 L 67 33 L 61 33 L 61 67 L 9 67 L 9 33 L 3 33 Z
           M 25 67 L 25 55 Q 25 48 35 48 Q 45 48 45 55 L 45 67 Z
           M 28 21 L 32 14 L 38 14 L 42 21 L 38 28 L 32 28 Z"/>
    </svg>
  )
}

export function MoviesIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox={VB} aria-hidden="true">
      <path fillRule="evenodd" fill="currentColor"
        d="M 15 3 L 55 3 Q 67 3 67 15 L 67 55 Q 67 67 55 67 L 15 67 Q 3 67 3 55 L 3 15 Q 3 3 15 3 Z
           M 24 18 L 24 52 L 54 35 Z"/>
    </svg>
  )
}

export function CalendarIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox={VB} aria-hidden="true">
      <path fillRule="evenodd" fill="currentColor"
        d="M 18 20 L 18 10 L 28 10 L 28 20 L 42 20 L 42 10 L 52 10 L 52 20 L 59 20 Q 64 20 64 25 L 64 59 Q 64 64 59 64 L 11 64 Q 6 64 6 59 L 6 25 Q 6 20 11 20 Z
           M 23 11.5 A 3.5 3.5 0 1 0 23 18.5 A 3.5 3.5 0 1 0 23 11.5 Z
           M 47 11.5 A 3.5 3.5 0 1 0 47 18.5 A 3.5 3.5 0 1 0 47 11.5 Z
           M 25 36.5 A 3.5 3.5 0 1 0 25 43.5 A 3.5 3.5 0 1 0 25 36.5 Z
           M 45 36.5 A 3.5 3.5 0 1 0 45 43.5 A 3.5 3.5 0 1 0 45 36.5 Z
           M 25 49.5 A 3.5 3.5 0 1 0 25 56.5 A 3.5 3.5 0 1 0 25 49.5 Z
           M 45 49.5 A 3.5 3.5 0 1 0 45 56.5 A 3.5 3.5 0 1 0 45 49.5 Z"/>
    </svg>
  )
}

export function SuggestionsIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox={VB} aria-hidden="true">
      <path fillRule="evenodd" fill="currentColor"
        d="M 35 4 L 43 25 L 65 26 L 47 40 L 54 62 L 35 49 L 16 62 L 23 40 L 5 26 L 27 25 Z
           M 35 31 A 5 5 0 1 0 35 41 A 5 5 0 1 0 35 31 Z"/>
    </svg>
  )
}

export function DVDIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox={VB} aria-hidden="true">
      <path fillRule="evenodd" fill="currentColor"
        d="M 35 3 A 32 32 0 1 0 35 67 A 32 32 0 1 0 35 3 Z
           M 35 13 A 22 22 0 1 0 35 57 A 22 22 0 1 0 35 13 Z
           M 35 27 A 8 8 0 1 0 35 43 A 8 8 0 1 0 35 27 Z"/>
    </svg>
  )
}

export function BookClubIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox={VB} aria-hidden="true">
      <path fillRule="evenodd" fill="currentColor"
        d="M 30 12 L 5 18 L 5 58 L 30 52 Z
           M 40 12 L 65 18 L 65 58 L 40 52 Z"/>
    </svg>
  )
}

export function SocialIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox={VB} aria-hidden="true">
      <path fillRule="evenodd" fill="currentColor"
        d="M 10 4 L 42 4 Q 48 4 48 10 L 48 30 Q 48 36 42 36 L 18 36 L 7 47 L 10 36 Q 4 36 4 30 L 4 10 Q 4 4 10 4 Z
           M 28 22 L 60 22 Q 66 22 66 28 L 66 48 Q 66 54 60 54 L 46 54 L 52 63 L 44 54 L 28 54 Q 22 54 22 48 L 22 28 Q 22 22 28 22 Z"/>
    </svg>
  )
}

// Admin: two paths rendered in paint order — gear behind, person in front.
// Both inherit currentColor from parent, so they merge into one silhouette
// while SVG layer order ensures the person covers the left side of the gear.
export function AdminIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox={VB} aria-hidden="true">
      {/* Gear with centre hole + checkmark (evenodd punches both through) */}
      <path fillRule="evenodd" fill="currentColor"
        d="M 44 13 L 50 23 L 62 20 L 59 32 L 69 38 L 59 44 L 62 56 L 50 53 L 44 63 L 38 53 L 26 56 L 29 44 L 19 38 L 29 32 L 26 20 L 38 23 Z
           M 44 24 A 14 14 0 1 0 44 52 A 14 14 0 1 0 44 24 Z
           M 35 37 L 39 33 L 42 38 L 50 26 L 54 30 L 42 46 Z"/>
      {/* Person silhouette — painted on top, covers left portion of gear */}
      <path fill="currentColor"
        d="M 22 11 A 12 12 0 1 0 22 35 A 12 12 0 1 0 22 11 Z
           M 4 68 Q 4 36 22 36 Q 40 36 40 68 Z"/>
    </svg>
  )
}

export function BookingsIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox={VB} aria-hidden="true">
      <path fillRule="evenodd" fill="currentColor"
        d="M 5 18 L 65 18 L 65 28 Q 68 35 65 42 L 65 52 L 5 52 L 5 42 Q 2 35 5 28 Z
           M 19 20 L 23 20 L 23 50 L 19 50 Z"/>
    </svg>
  )
}

export function BarIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox={VB} aria-hidden="true">
      <path fill="currentColor"
        d="M 10 10 L 60 10 L 38 40 L 38 60 L 50 60 L 50 65 L 20 65 L 20 60 L 32 60 L 32 40 Z"/>
    </svg>
  )
}

// Bus — used as an event-level badge for offsite social events, not in nav.
export function BusIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox={VB} aria-hidden="true">
      <path fillRule="evenodd" fill="currentColor"
        d="M 2 17 Q 2 11 8 11 L 62 11 Q 68 11 68 17 L 68 53 L 2 53 Z
           M 14 44 A 9 9 0 1 0 14 62 A 9 9 0 1 0 14 44 Z
           M 56 44 A 9 9 0 1 0 56 62 A 9 9 0 1 0 56 44 Z
           M 5 15 L 5 31 L 18 31 L 18 15 Z
           M 22 15 L 22 31 L 35 31 L 35 15 Z
           M 39 15 L 39 31 L 52 31 L 52 15 Z"/>
    </svg>
  )
}

// ── Admin section icons ───────────────────────────────────────────────────────

// Page/document silhouette with dog-ear fold corner
export function PageTextsIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox={VB} aria-hidden="true">
      <path fillRule="evenodd" fill="currentColor"
        d="M 10 5 L 48 5 L 60 19 L 60 65 L 10 65 Z
           M 48 5 L 48 19 L 60 19 Z"/>
    </svg>
  )
}

// Two overlapping person silhouettes — back one at 45% opacity
export function MembersIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox={VB} aria-hidden="true">
      <path fill="currentColor" fillOpacity={0.45}
        d="M 42 5 A 11 11 0 1 0 42 27 A 11 11 0 1 0 42 5 Z
           M 24 68 Q 24 38 42 38 Q 60 38 60 68 Z"/>
      <path fill="currentColor"
        d="M 26 13 A 11 11 0 1 0 26 35 A 11 11 0 1 0 26 13 Z
           M 8 68 Q 8 46 26 46 Q 44 46 44 68 Z"/>
    </svg>
  )
}

// Gear centred at (35,35) — same geometry as AdminIcon gear, shifted
export function ToolsIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox={VB} aria-hidden="true">
      <path fillRule="evenodd" fill="currentColor"
        d="M 35 10 L 41 20 L 53 17 L 50 29 L 60 35 L 50 41 L 53 53 L 41 50 L 35 60 L 29 50 L 17 53 L 20 41 L 10 35 L 20 29 L 17 17 L 29 20 Z
           M 35 21 A 14 14 0 1 0 35 49 A 14 14 0 1 0 35 21 Z"/>
    </svg>
  )
}

// ── Useful Information hub icons ─────────────────────────────────────────────

// Info circle with "i" — hub nav icon
export function InfoIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox={VB} aria-hidden="true">
      <path fillRule="evenodd" fill="currentColor"
        d="M 35 3 A 32 32 0 1 0 35 67 A 32 32 0 1 0 35 3 Z
           M 35 7 A 28 28 0 1 0 35 63 A 28 28 0 1 0 35 7 Z
           M 35 16 A 5 5 0 1 0 35 26 A 5 5 0 1 0 35 16 Z
           M 30 31 L 30 52 L 40 52 L 40 31 Z"/>
    </svg>
  )
}

// Stacked document pages — documents sub-page icon
export function DocumentsIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox={VB} aria-hidden="true">
      <path fillRule="evenodd" fill="currentColor"
        d="M 18 8 L 48 8 L 58 20 L 58 60 L 18 60 Z
           M 48 8 L 48 20 L 58 20 Z
           M 27 32 L 49 32 L 49 37 L 27 37 Z
           M 27 42 L 49 42 L 49 47 L 27 47 Z
           M 27 22 L 38 22 L 38 27 L 27 27 Z"/>
    </svg>
  )
}

// Address book — contacts sub-page icon
export function ContactsIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox={VB} aria-hidden="true">
      <path fillRule="evenodd" fill="currentColor"
        d="M 15 5 L 57 5 Q 63 5 63 11 L 63 59 Q 63 65 57 65 L 15 65 Q 9 65 9 59 L 9 11 Q 9 5 15 5 Z
           M 5 18 L 13 18 L 13 26 L 5 26 Z
           M 5 31 L 13 31 L 13 39 L 5 39 Z
           M 5 44 L 13 44 L 13 52 L 5 52 Z
           M 36 15 A 10 10 0 1 0 36 35 A 10 10 0 1 0 36 15 Z
           M 18 54 Q 18 38 36 38 Q 54 38 54 54 Z"/>
    </svg>
  )
}
