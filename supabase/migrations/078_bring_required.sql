-- 078_bring_required.sql
-- "Attendees bring something" was wrongly modelled as a club-wide switch:
-- clubs.bring_enabled made EVERY event in that club require a bring
-- selection, with events.bring_category_ids only narrowing WHICH categories
-- applied -- there was no way to say "this specific event doesn't need it"
-- short of it defaulting to "all categories" (BringCategoryPicker treated a
-- null/empty selection as "everything selected"). Iain, 2026-08-07: bring
-- should be opt-in per EVENT (no categories picked = not relevant to this
-- event, even though the club supports it and another event in the same
-- club might use it), and separately, whether it's mandatory or optional
-- to complete a booking should be an explicit choice, not implied by the
-- club flag.
--
-- This column carries that second, separate choice. Applicability is
-- events.bring_category_ids having at least one entry (code-level, no
-- schema change needed there); this column says whether picking one of
-- those categories is REQUIRED to book, or just offered.
--
-- Defaults to false (optional) for both new and existing rows -- no
-- currently-live non-archived event actually relies on the old "club flag
-- implies mandatory" behaviour (checked 2026-08-07: the one real bring
-- event, Dinner Club's Sydney Harbour Night, already has an explicit
-- non-empty bring_category_ids; Secret Men's Business's two events were
-- both already cancelled). Nothing to backfill.

ALTER TABLE events ADD COLUMN IF NOT EXISTS bring_required boolean NOT NULL DEFAULT false;
ALTER TABLE event_series ADD COLUMN IF NOT EXISTS bring_required boolean NOT NULL DEFAULT false;
