-- 064_event_reminder.sql
--
-- "Day-before" event reminder (Iain, 2026-07-26) -- flagged as missing while
-- drafting the community flyer, which had claimed this already existed. It
-- didn't: notifications only ever fired at the moment of a booking action
-- (confirmed/cancelled/waitlist-promoted) or for payment/book-return due
-- dates -- nothing reminded a resident that something they're booked into is
-- actually happening tomorrow. Applies across every hub (Movies, Social,
-- Clubs/Book Club) -- any confirmed booking, not hub-specific.
--
-- event_reminded_at: nullable TIMESTAMPTZ, once-only per booking (an event
-- only happens once, unlike the Book Club loan-cycle reminder which resets
-- on each new loan) -- mirrors bookings.book_return_reminded_at (migration
-- 041) and bookings.payment_reminded_at (migration 043) exactly.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS event_reminded_at TIMESTAMPTZ;
