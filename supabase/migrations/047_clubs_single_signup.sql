-- 047_clubs_single_signup.sql
--
-- Phase 2b. Book Club books ONE seat per person ("Sign Up") with no seat
-- picker and no "Modify Seats"; Social/Movies book a number of seats. That
-- difference was previously implied by `hub_type === 'bookclub'` hardcoded in
-- components/EventSlideOut.js — which broke the moment Book Club started
-- rendering as a generic club (Iain's live-vs-preview comparison, 2026-07-17:
-- "Modify Seats" wrongly appeared on a Book Club event).
--
-- It's a real per-club capability, not a hub name: Dinner Club will want
-- multi-seat booking (guests + bring-a-dish), Book Club will not. So it
-- becomes an explicit flag the Club Manager exposes.
--
-- ADDITIVE and safe: defaults to false (seat booking, the common case) and is
-- set true only for Book Club, preserving today's behaviour exactly.

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS single_signup BOOLEAN NOT NULL DEFAULT false;
UPDATE clubs SET single_signup = true WHERE slug = 'book-club';
