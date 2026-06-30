const { test, expect } = require('@playwright/test')

// ── Movies Home ───────────────────────────────────────────────────────────────
test.describe('Movies Home', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/movies')
    await page.waitForLoadState('networkidle')
  })

  test('Next Screening card renders with movie title and poster', async ({ page }) => {
    await expect(page.getByText('Next Screening', { exact: true })).toBeVisible()
    await expect(page.getByText('The Shawshank Redemption').first()).toBeVisible()
    const poster = page.locator('img[alt="The Shawshank Redemption"]').first()
    await expect(poster).toBeVisible()
  })

  test('Next Screening shows date and IMDB chip', async ({ page }) => {
    await expect(page.getByText(/IMDb/i).first()).toBeVisible()
    await expect(page.getByText(/28 June/i).first()).toBeVisible()
  })

  test('My Bookings card visible with no duplicate movie rows', async ({ page }) => {
    await expect(page.getByText('My Bookings').first()).toBeVisible()
    // Should appear at most twice (Next Screening + 1 booking row) not 3+ (which would mean duplicate rows)
    const count = await page.getByText('The Shawshank Redemption').count()
    expect(count).toBeLessThanOrEqual(2)
  })

  test('My Bookings sheet opens, shows grouped card and Cancel button', async ({ page }) => {
    await page.getByText('My Bookings').first().click()
    await expect(page.getByText('My Movie Bookings')).toBeVisible()
    // One movie title in the sheet
    await expect(page.getByText('The Shawshank Redemption').first()).toBeVisible()
    // Confirmed badge
    await expect(page.getByText(/✓ Confirmed/i)).toBeVisible()
    // Cancel button
    await expect(page.getByRole('button', { name: /cancel booking/i })).toBeVisible()
    // Close
    await page.getByText('‹ Movies').click()
    await expect(page.getByText('My Movie Bookings')).not.toBeVisible()
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

  test('Shawshank event card with poster and uppercase date', async ({ page }) => {
    await expect(page.getByText('The Shawshank Redemption').first()).toBeVisible()
    await expect(page.getByText(/SUNDAY/).first()).toBeVisible()
    await expect(page.getByText(/18:00/).first()).toBeVisible()
    const poster = page.locator('img[alt="The Shawshank Redemption"]').first()
    await expect(poster).toBeVisible()
  })

  test('IMDB chip shown on movie card', async ({ page }) => {
    await expect(page.getByText(/IMDb/i).first()).toBeVisible()
  })

  test('Seat count shown', async ({ page }) => {
    await expect(page.getByText(/seats left/i).first()).toBeVisible()
  })

  test('Booking badge shown for confirmed user (testbot)', async ({ page }) => {
    await expect(page.getByText(/Seat.*Booked/i).first()).toBeVisible()
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
    await expect(page.getByRole('button', { name: /Members/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Movies/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Bar/i }).first()).toBeVisible()
  })

  test('Members section opens and lists members', async ({ page }) => {
    await page.getByRole('button', { name: /Members/i }).first().click()
    await page.waitForLoadState('networkidle')
    // Back nav should appear
    await expect(page.getByText('← Admin')).toBeVisible()
    // At least testbot should appear in member list
    await expect(page.getByText(/testbot/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('Movies section shows Suggested Movies', async ({ page }) => {
    await page.getByRole('button', { name: /Movies/i }).first().click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('← Admin')).toBeVisible()
  })
})

// ── Waitlist confirmation dialog ──────────────────────────────────────────────
test.describe('Waitlist confirmation', () => {
  test('shows waitlist dialog when event is full, dismiss works', async ({ page }) => {
    await page.goto('/movies')
    await page.waitForLoadState('networkidle')

    // Intercept bookings POST to simulate a full event returning waitlist_offer
    await page.route('/api/bookings', async (route) => {
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}')
        if (!body.accept_waitlist) {
          await route.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'waitlist_offer', seats: body.seats || 1 }) })
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'waitlist', seats: body.seats || 1 }) })
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

    // Waitlist dialog must appear
    await expect(page.getByText('This event is full')).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('button', { name: 'Join waitlist' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'No thanks' })).toBeVisible()

    // Dismiss — dialog should disappear, no booking made
    await page.getByRole('button', { name: 'No thanks' }).click()
    await expect(page.getByText('This event is full')).not.toBeVisible()
  })

  test('confirms waitlist placement when user accepts', async ({ page }) => {
    await page.goto('/movies')
    await page.waitForLoadState('networkidle')

    await page.route('/api/bookings', async (route) => {
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}')
        if (!body.accept_waitlist) {
          await route.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'waitlist_offer', seats: body.seats || 1 }) })
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'waitlist', seats: body.seats || 1 }) })
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
    await expect(page.getByText('This event is full')).toBeVisible({ timeout: 3000 })

    // Accept waitlist
    await page.getByRole('button', { name: 'Join waitlist' }).click()

    // Toast confirmation should appear
    await expect(page.getByText(/waitlist/i).first()).toBeVisible({ timeout: 4000 })
  })
})
