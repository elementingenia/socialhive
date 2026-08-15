// lib/memberName.js
//
// Central resolver for how a member's name should render across the app.
// Single source of truth for the existing hide_name ("Private") masking
// rule PLUS the new display_name preference (change request log #1,
// 2026-08-14), so the two don't drift out of sync across the many call
// sites that previously inlined this ternary by hand -- screenings,
// coordinator, ClubHome, EventSlideOut, contacts page, categoryQuestions.
//
// Confirmed design (Iain, 2026-08-14): masking is UNCHANGED. When a
// member has hide_name set and the viewer isn't privileged for this
// context, the result is the literal 'Resident' placeholder -- full stop,
// regardless of display_name. A member's own row is never masked (same as
// the existing convention across every call site this replaces).
//
// Revised same day, Iain's explicit call: display_name is NOT a "use this
// if set, else fall back to name" field. It defaults to Real Name the
// moment a member is created (see app/api/auth/register/route.js and
// app/api/admin/accounts/route.js) and is NOT NULL from migration 083
// onward, validated the same way on every edit (isValidDisplayName,
// below). So every unmasked render just shows display_name, full stop --
// the `|| member.name` below is a defensive safety net for pre-migration
// legacy rows only, not the intended behaviour.
//
// This file is being introduced incrementally -- not every existing
// inline ternary has been converted to call it yet. See
// Element_Happenings_Display_Name_Scope.md for the rollout list.

/**
 * @param {object|null} member - a members row (or null). Needs at least
 *   `id`, `name`, `display_name`, `hide_name`.
 * @param {object} opts
 * @param {string|null} [opts.viewerId] - the current viewer's member id.
 *   When it matches member.id, masking never applies (own row).
 * @param {boolean} [opts.canManage] - true for a viewer privileged in this
 *   context (admin, EC, coordinator, Owner) -- bypasses masking, same as
 *   the existing `canManageBooks`/`isAdmin` checks at each call site.
 * @param {string|null} [opts.selfLabel] - if set (e.g. "You"), used
 *   instead of the member's own name when isOwn is true. Leave unset to
 *   show the member their own preferred/real name instead.
 * @param {string} [opts.fallback] - what to show when masked or when
 *   there's no member at all. Defaults to "Resident", matching every
 *   existing call site.
 */
export function resolveMemberName(member, opts = {}) {
  const { viewerId = null, canManage = false, selfLabel = null, fallback = "Resident" } = opts
  if (!member) return fallback
  const isOwn = viewerId != null && member.id === viewerId
  if (isOwn && selfLabel) return selfLabel
  if (member.hide_name && !canManage && !isOwn) return fallback
  return member.display_name || member.name || fallback
}

// Validation rule (Iain, 2026-08-14): a Display Name can't be saved blank,
// and needs at least 3 LETTERS -- spaces, digits and punctuation don't
// count toward that minimum, so "12" or "..." or "  " are all rejected,
// but "Jo" is rejected too (2 letters) while "J.J." passes (4 letters).
// Enforced both here (client + server share this one function) and, once
// existing rows are backfilled, by the NOT NULL constraint at the DB layer
// -- this is the pre-save gate that keeps bad data from ever reaching it.
export function isValidDisplayName(value) {
  if (typeof value !== "string") return false
  const letters = value.match(/[A-Za-z]/g) || []
  return letters.length >= 3
}
