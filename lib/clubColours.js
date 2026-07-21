// Curated club identity palette (Club Visual Identity, 2026-07-21).
//
// 16 vivid, perceptually-spaced colours, each verified to clear WCAG AA against
// its paired text colour. Unlike the 3 hub colours (all dark -> white text), this
// palette includes light colours (Gold, Salmon, Rose), so a club's colour must
// always be rendered WITH its paired text colour -- never a hardcoded #fff.
//
// Storage: clubs.colour holds the hex `value`. Legacy rows may still hold a CSS
// var() (var(--purple) etc.) until backfilled -- the helpers below tolerate that.

export const CLUB_COLOURS = [
  { label: "Ruby",       value: "#C62F3B", hex: "#C62F3B" },
  { label: "Salmon",     value: "#F47B5C", hex: "#F47B5C" },
  { label: "Pumpkin",    value: "#E8730E", hex: "#E8730E" },
  { label: "Gold",       value: "#F3C21A", hex: "#F3C21A" },
  { label: "Olive",      value: "#8FAF20", hex: "#8FAF20" },
  { label: "Emerald",    value: "#12A05E", hex: "#12A05E" },
  { label: "Aqua",       value: "#12A6B6", hex: "#12A6B6" },
  { label: "Sky",        value: "#37A0E0", hex: "#37A0E0" },
  { label: "Cobalt",     value: "#2A54C8", hex: "#2A54C8" },
  { label: "Periwinkle", value: "#6E67D8", hex: "#6E67D8" },
  { label: "Grape",      value: "#7E3FB0", hex: "#7E3FB0" },
  { label: "Orchid",     value: "#AC3EBA", hex: "#AC3EBA" },
  { label: "Magenta",    value: "#C92C86", hex: "#C92C86" },
  { label: "Rose",       value: "#F06699", hex: "#F06699" },
  { label: "Chestnut",   value: "#8A5A44", hex: "#8A5A44" },
  { label: "Slate",      value: "#5F6E7C", hex: "#5F6E7C" },
]

// Legacy CSS-var -> hex, so the helpers still work for any club not yet backfilled.
const LEGACY_HEX = {
  "var(--purple)": "#7c3aed",
  "var(--teal)": "#0d9488",
  "var(--terracotta)": "#c2410c",
}

function toHex(colour) {
  if (!colour) return "#7c3aed"
  if (colour.startsWith("#")) return colour
  return LEGACY_HEX[colour] || "#7c3aed"
}
function rgb(hex) {
  const h = toHex(hex).replace("#", "")
  const n = h.length === 3 ? h.split("").map(c => c + c).join("") : h
  return [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16))
}
function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
function lum(hex) { const [r, g, b] = rgb(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
function contrast(a, b) { const L = [lum(a), lum(b)].sort((x, y) => y - x); return (L[0] + 0.05) / (L[1] + 0.05) }

// Text colour to place ON a club-colour background -- white or near-black,
// whichever has more contrast. This is what replaces every hardcoded #fff.
export function clubTextOn(colour) {
  return contrast(colour, "#FFFFFF") >= contrast(colour, "#1F1F1F") ? "#FFFFFF" : "#1F1F1F"
}

// A readable-on-white version of the club colour, for using the colour itself as
// text / an accent on a light background (e.g. the bottom-nav club label, tinted
// chips). Dark palette colours pass through unchanged; light ones (Gold/Salmon...)
// are darkened until they clear ~4.5:1 on white so they stay legible.
export function clubInk(colour) {
  const hex = toHex(colour)
  if (contrast(hex, "#FFFFFF") >= 4.5) return hex
  let [r, g, b] = rgb(hex)
  for (let f = 0.95; f >= 0.2; f -= 0.05) {
    const scaled = "#" + [r, g, b].map(c => Math.round(c * f).toString(16).padStart(2, "0")).join("")
    if (contrast(scaled, "#FFFFFF") >= 4.5) return scaled
  }
  return "#1F1F1F"
}

// Auto-assign on club creation: the next palette colour not already in use,
// wrapping to the least-used once all 16 are taken.
export function nextClubColour(usedColours = []) {
  const used = usedColours.map(c => (c || "").toUpperCase())
  const free = CLUB_COLOURS.find(c => !used.includes(c.value.toUpperCase()))
  if (free) return free.value
  const counts = CLUB_COLOURS.map(c => ({
    value: c.value,
    n: used.filter(u => u === c.value.toUpperCase()).length,
  }))
  counts.sort((a, b) => a.n - b.n)
  return counts[0].value
}
