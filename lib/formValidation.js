// Shared "mandatory field incomplete" treatment + scroll-to-first-error for
// event create/edit forms (Social, Movies/Show Time, Clubs & Groups). Two
// bugs found together (Iain, 2026-08-04):
//
//  1. None of the three forms told the user WHICH field was missing beyond
//     a single line of red text above Save, and none of them scrolled to
//     it -- on a long form (Social's is 900+ px tall) the red text and the
//     actual field can be off-screen from each other at the same time.
//  2. A plain red border/text is a bad "this is incomplete" signal on
//     Social specifically: its hub accent (--terracotta, #c2410c) and the
//     app's danger colour (--danger, #dc2626) are both in the same
//     red/brown family, so a red outline reads as "this is themed like
//     everything else on this screen", not "this needs your attention".
//     Fixing it by dropping red from the danger colour was ruled out
//     (Iain) -- you'd have to drop green too, for the same reason it clashes
//     with Outings' green, and the palette would be too limited.
//
// Fix is a solid red border PLUS a visible light-red fill, applied directly
// to the actual control the resident sees and taps (the input/select/button
// itself, not a wrapping div) -- an earlier version of this wrapped fields
// in a padded outer box, which meant the fill sat in the gap AROUND an
// opaque inner control and was practically invisible (Iain, 2026-08-04:
// "I don't see any red fill yet"). rgba() is used rather than
// `var(--danger)` string-concatenated with a hex alpha suffix (a pattern
// used elsewhere in this codebase for literal hex colours only) because
// var() references resolve to a single token -- appending characters after
// `var(--x)` in a JS template string does not produce a valid CSS colour.
//
// Also: this must be LIVE (recomputed from current form state on every
// render), not gated behind a Save click -- Title/Date already worked this
// way before this fix existed, and Iain expects every mandatory field to
// behave the same, visible as soon as the form opens on a blank value, not
// only after a failed Save attempt.
//
// The ⚠ Required text marker (requiredMarkerText, below) stays alongside
// the colour treatment on purpose -- never rely on colour alone (WCAG
// 1.4.1), worth it doubly for this app's 55+ audience, and it's what keeps
// this legible on Social specifically (its hub colour, --terracotta
// #c2410c, sits close to --danger #dc2626 in the same red/brown family).

export const INVALID_FIELD_STYLE = {
  border: "2px solid #dc2626",
  background: "rgba(220, 38, 38, 0.10)",
  borderRadius: "10px",
}

// Small inline marker to add next to a field's own asterisk once the user
// has tried to save and this field is still empty -- e.g.
// `<label>Location <RequiredMarker show={invalid.includes("location")} /></label>`
// Deliberately text + symbol, not a colour swatch, so it isn't lost on
// anyone who can't distinguish red from the hub's own accent colour.
export function requiredMarkerText(show) {
  return show ? " ⚠ Required" : ""
}

// Scrolls to and focuses the first invalid field, given:
//  - fieldRefs: a useRef({}) whose values get set via a ref callback on
//    each field's wrapper, e.g. ref={el => (fieldRefs.current.title = el)}
//  - orderedKeys: field keys in the order they actually appear on screen
//    (NOT the order validation happens to run in -- those can differ)
//  - invalidKeys: the keys currently failing validation
export function scrollToFirstInvalid(fieldRefs, orderedKeys, invalidKeys) {
  const key = orderedKeys.find(k => invalidKeys.includes(k))
  if (!key) return
  const el = fieldRefs.current?.[key]
  if (!el) return
  el.scrollIntoView({ behavior: "smooth", block: "center" })
  const focusable = el.querySelector("input, textarea, button, select, [tabindex]")
  // preventScroll -- scrollIntoView above already handled positioning;
  // focus() with its own scroll would fight the smooth scroll mid-animation.
  focusable?.focus?.({ preventScroll: true })
}
