// The "Residents" category is created by migration 029 and is structural: every
// active member belongs to it implicitly (no row is ever stored), so it can't be
// deleted without breaking the Contacts list.
//
// This is the ONE place the magic string lives. It used to be spelled out in
// the category DELETE route and again in CategoryManager. Note that whether a
// category can be ASKED a question is no longer decided by its name at all --
// that's the explicit `contact_categories.askable` column (migration 065).
export const BUILT_IN_CATEGORY = "residents"

export function isBuiltInCategory(name) {
  return (name || "").trim().toLowerCase() === BUILT_IN_CATEGORY
}
