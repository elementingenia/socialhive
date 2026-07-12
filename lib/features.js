// Feature flags — a single switch per descoped/parked feature.
//
// Flip a flag to `true` to bring a feature back. The UI (nav entries, cards,
// admin sections, profile toggles, help-guide content) is gated behind these
// flags; the underlying schema, API routes, and components are left in place
// untouched so re-enabling is a one-line change, not a rebuild.

// Community Bar (honour-bar tab, admin reconciliation) — parked 2026-07-12
// per system review: not in scope for now. Code, DB tables (bar_products,
// bar_tabs, bar_member_payments, bar_reconciliations) and API routes are
// retained as-is; only UI surfaces are hidden.
export const BAR_ENABLED = false
