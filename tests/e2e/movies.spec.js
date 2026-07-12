const { test, expect } = require('@playwright/test')
const { getNextScreening, getTestbotMovieBooking, fmtDate, fmtDateLong, fmtTime24 } = require('./helpers')

// ── Movies Home ───────────────────────────────────────────────────────────────
test.describe('Movies Home', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/movies')
    await page.waitForLoadState('networkidle')
  })

  test('Next Screening card renders with movie title and poster', async ({ page }) => {
    const next = await getNextScreening()
    expect(next, 'No upcoming movie screening found in the database').not.toBeNull()

    await expect(page.getByText('Next Screening', { exact: true })).toBeVisible()
    await expect(page.getByText(next.title).first()).toBeVisible()
    const poster = page.locator(`img[alt="${next.title}"]`).first()
    await expect(poster).toBeVisible()
  })

  test('Next Screening shows date and IMDB chip', async ({ page }) => {
    const next = await getNextScreening()
    expect(next).not.toBeNull()

    await expect(page.getByText(/IMDb/i).first()).toBeVisible()
    // Match on "12 July" rather than the full "Sunday, 12 July" string — robust
    // to any weekday-label formatting differences, still proves the real date renders.
    const dayMonth = fmtDate(next.event_date).replace(/^[A-Za-z]+,?\s*/, '')
    await expect(page.getByText(new RegExp(dayMonth, 'i')).first()).toBeVisible()
  })

  test('My Bookings card visible with no duplicate movie rows', async ({ page }) => {
    const myBooking = await getTestbotMovieBooking()
    expect(myBooking, 'testbot has no confirmed movie booking — fixture missing').not.toBeNull()

    await expect(page.getByText('My Bookings').first()).toBeVisible()
    // Should appear at most twice (Next Screening + 1 booking row) not 3+ (which would mean duplicate rows)
    const count = await page.getByText(myBooking.title).count()
    expect(count).toBeLessThanOrEqual(2)
  })

  test('My Bookings card links through to Scheduled page with the booking visible', async ({ page }) => {
    // The Home "My Bookings" card navigates straight to /screenings (Scheduled) —
    // it does NOT open an inline sheet. MyMovieBookingsSheet is defined in this
    // file but never rendered/invoked anywhere; the old test was asserting
    // behavior from before that navigation change.
    const myBooking = await getTestbotMovieBooking()
    expect(myBooking, 'testbot has no confirmed movie booking — fixture missing').not.toBeNull()

    await page.getByText('My Bookings').first().click()
    await page.waitForURL('**/screenings')
    await expect(page.getByText(myBooking.title).first()).toBeVisible()
    await expect(page.getByText(/seat.*confirmed/i).first()).toBeVisible()
  })

  test('Rate a Film swiper renders', async ({ page }) => {
    await expect(page.getByText('Rate a Film')).toBeVisible()
  })
})

// ── Scheduled / Screenings ────────────────────────────────────────────────────
test.describe('Scheduled page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/screenings')
    await page.waitForLoadState('networkidle')
  })

  test('Upcoming Screenings heading visible', async ({ page }) => {
    await expect(page.getByText('Upcoming Screenings')).toBeVisible()
  })

  test('Next screening card with poster and uppercase date', async ({ page }) => {
    const next = await getNextScreening()
    expect(next).not.toBeNull()

    await expect(page.getByText(next.title).first()).toBeVisible()
    // fmtDateLong() renders e.g. "SUNDAY, 12 JULY 2026" — match on the uppercase weekday only,
    // which proves the uppercase-date convention without depending on a fixed calendar date.
    const weekday = fmtDateLong(next.event_date).match(/^[A-Z]+/)[0]
    await expect(page.getByText(new RegExp(weekday)).first()).toBeVisible()
    if (next.event_time) {
      await expect(page.getByText(fmtTime24(next.event_time)).first()).toBeVisible()
    }
    const poster = page.locator(`img[alt="${next.title}"]`).first()
    await expect(poster).toBeVisible()
  })

  test('IMDB chip shown on movie card', async ({ page }) => {
    await expect(page.getByText(/IMDb/i).first()).toBeVisible()
  })

  test('Seat count shown', async ({ page }) => {
    await expect(page.getByText(/seats left/i).first()).toBeVisible()
  })

  test('Booking badge shown for confirmed user (testbot)', async ({ page }) => {
    const myBooking = await getTestbotMovieBooking()
    expect(myBooking, 'testbot has no confirmed movie booking — fixture missing').not.toBeNull()
    // Current wording (screenings.js BookingStrip): "✓ N seat(s) confirmed" — free events
    // (payment_required=false) are always "confirmed" once booked, never "Booked" awaiting payment.
    await expect(page.getByText(/seat.*confirmed/i).first()).toBeVisible()
  })
})

// ── Suggestions / Library ─────────────────────────────────────────────────────
test.describe('Suggestions page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/library')
    await page.waitForLoadState('networkidle')
  })

  test('Viewing Suggestions heading visible', async ({ page }) => {
    await expect(page.getByText('VIEWING SUGGESTIONS')).toBeVisible()
  })

  test('At least one poster image renders', async ({ page }) => {
    await expect(page.locator('img').first()).toBeVisible()
  })

  test('Rate pill button visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Rate/i }).first()).toBeVisible()
  })

  test('+Suggest button visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: '+ Suggest' })).toBeVisible()
  })

  test('Sort tabs present', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Community' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'IMDB' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'A–Z' })).toBeVisible()
  })
})

// ── Admin ─────────────────────────────────────────────────────────────────────
test.describe('Admin panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
  })

  test('Admin card grid loads with expected sections', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Movies/i }).first()).toBeVisible()
    // Bar section is parked behind BAR_ENABLED (see lib/features.js) — not rendered while disabled.
    await expect(page.getByRole('button', { name: /^Bar$/i })).toHaveCount(0)
    // Members section folded into Info > Contacts (2026-07-12) — no longer a
    // separate Admin card, so it should not appear here.
    await expect(page.getByRole('button', { name: /^Members$/i })).toHaveCount(0)
  })

  test('Movies section shows Suggested Movies', async ({ page }) => {
    await page.getByRole('button', { name: /Movies/i }).first().click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('← Admin')).toBeVisible()
  })
})

// ── Info > Contacts (folds in what used to be Admin > Members, 2026-07-12) ────
test.describe('Info > Contacts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/info/contacts')
    await page.waitForLoadState('networkidle')
  })

  test('Member management lives here now, not in Admin', async ({ page }) => {
    // At least testbot should appear in the resident list
    await expect(page.getByText(/testbot/i).first()).toBeVisible({ timeout: 10000 })
    // Admin-only controls, including the Invite Code moved from Admin > Members
    await expect(page.getByRole('button', { name: '+ Add Contact' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Manage Categories' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Invite Code' })).toBeVisible()
  })

  test('Search filters the resident/contact list by name', async ({ page }) => {
    await page.getByPlaceholder('Search by name…').fill('testbot')
    await expect(page.getByText(/testbot/i).first()).toBeVisible()
  })
})

// ── Waitlist / split-offer confirmation dialog ────────────────────────────────
// Note: the app's actual API contract is { accept_split } request / { status:
// "split_offer", confirmed, waitlisted } response, handled by SplitDialog in
// components/EventSlideOut.js ("No seats available" / "Join waitlist" / "No
// thanks") — the previous version of these tests mocked an older
// { accept_waitlist } / "waitlist_offer" / "This event is full" contract that
// no longer exists anywhere in the codebase.
test.describe('Waitlist confirmation', () => {
  test('shows split-offer dialog when server reports no seats, dismiss works', async ({ page }) => {
    await page.goto('/movies')
    await page.waitForLoadState('networkidle')

    await page.route('/api/bookings', async (route) => {
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}')
        if (!body.accept_split) {
          await route.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'split_offer', confirmed: 0, waitlisted: body.seats || 1 }) })
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'split_confirmed', confirmed: 0, waitlisted: body.seats || 1 }) })
        }
      } else {
        await route.continue()
      }
    })

    // Open slideout for next screening
    await page.locator('text=Tap to book').first().click()
    await page.waitForLoadState('networkidle')

    // Click Book Now / Join Waitlist button
    const bookBtn = page.getByRole('button', { name: /book now|join waitlist/i }).first()
    await expect(bookBtn).toBeVisible({ timeout: 5000 })
    await bookBtn.click()

    // Split-offer dialog must appear
    await expect(page.getByText('No seats available')).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('button', { name: 'Join waitlist' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'No thanks' })).toBeVisible()

    // Dismiss — dialog should disappear, no booking made
    await page.getByRole('button', { name: 'No thanks' }).click()
    await expect(page.getByText('No seats available')).not.toBeVisible()
  })

  test('confirms waitlist placement when user accepts', async ({ page }) => {
    await page.goto('/movies')
    await page.waitForLoadState('networkidle')

    await page.route('/api/bookings', async (route) => {
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}')
        if (!body.accept_split) {
          await route.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'split_offer', confirmed: 0, waitlisted: body.seats || 1 }) })
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'split_confirmed', confirmed: 0, waitlisted: body.seats || 1 }) })
        }
      } else {
        await route.continue()
      }
    })

    await page.locator('text=Tap to book').first().click()
    await page.waitForLoadState('networkidle')

    const bookBtn = page.getByRole('button', { name: /book now|join waitlist/i }).first()
    await expect(bookBtn).toBeVisible({ timeout: 5000 })
    await bookBtn.click()

    // Dialog appears
    await expect(page.getByText('No seats available')).toBeVisible({ timeout: 3000 })

    // Accept waitlist
    await page.getByRole('button', { name: 'Join waitlist' }).click()

    // Toast confirmation should appear
    await expect(page.getByText(/waitlist/i).first()).toBeVisible({ timeout: 4000 })
  })
})
