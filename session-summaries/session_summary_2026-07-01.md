# Session Summary — 2026-07-01

## What Was Built

### iOS Viewport Bug — Fully Resolved
Resolved a multi-root mobile bug where the app zoomed out after login and BottomNav was hidden behind browser chrome:
- `overflow-x: hidden` on `<body>` breaks `position: fixed` on iOS → removed body overflow entirely, set on `html` only
- `env(safe-area-inset-bottom)` added to BottomNav `paddingBottom`
- `paddingBottom` on InnerLayout updated to `calc(70px + env(safe-area-inset-bottom, 0px))`
- iOS Safari auto-zoom root cause: inputs at < 16px font size → fixed with global `font-size: 16px !important` on inputs in `globals.css`
- `min-height: 100dvh` on body and loading spinner

### Help Page (`/help`)
Full in-app user guide with real screenshots:
- 18 screenshots captured via html2canvas → uploaded to Supabase Storage bucket `help-screenshots` (public)
- 8 sections: Sign In & Register, Profile & PIN, Movies, Social, Book Club, My Bar, Calendar, Bookings
- EC-only sections badged with teal "EC ONLY" pill
- Horizontal scrollable jump-nav chips at top
- Entry: `?` button in Header (already wired, present on all pages)
- Screenshot base URL: `https://tzzxwvbqszzrruxjrpcs.supabase.co/storage/v1/object/public/help-screenshots/`

### Other Fixes
- Social attendees accordion: "X seats of Y (Z unpaid)" — unpaid after "of Y"
- EC name + Bus driver on both event tile and booking modal
- Calendar defaults to month view at `/cal`, week elsewhere
- Cross-hub attendees consistency: Movies, Social, Outings all match

## Current Build State
- All tasks complete, build clean (46/46 pages)
- Production: `socialhive-lew3.vercel.app`
- Baseline tag: `baseline-2026-06-23` (still valid)

## Next Backlog
- Book Club bespoke UI — EventSlideOut vs inline decision
- Profile fields (email, house number, name toggle, bar toggle, avatar)
- Regression test suite — data-agnostic selectors across all hubs
- In-app notifications (deferred)
- DVD "Suggest from Library" (deferred)

## Notes
- testbot `bar_opt_in` was set to `true` during screenshot capture (was false)
- Chrome Saved Tab Groups cannot be cleared programmatically — right-click chips to delete
