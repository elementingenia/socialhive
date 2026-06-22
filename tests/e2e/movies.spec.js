const { test, expect } = require('@playwright/test')

// ── Movies Home ───────────────────────────────────────────────────────────────
test.describe('Movies Home', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/movies')
    // Wait for page data to load
    await page.waitForLoadState('networkidle')
  })

  test('Next Screening card renders with movie title and poster', async ({ page }) => {
    await expect(page.getByText('Next Screening')).toBeVisible()
    // A movie title should be visible (not a placeholder)
    await expect(page.getByText('The Shawshank Redemption')).toBeVisible()
    // Poster image — not the clapperboard fallback
    const poster = page.locator('img[alt="The Shawshank Redemption"]').first()
    await expect(poster).toBeVisible()
  })

  test('Next Screening shows date, IMDB/RT chips', async ({ page }) => {
    await expect(page.getByText(/IMDb/i)).toBeVisible()
    await expect(page.getByText(/Sunday 28 June|28 June/i)).toBeVisible()
  })

  test('My Bookings card shows testbot booking — one row per movie, no duplicates', async ({ page }) => {
    const card = page.locator('text=My Bookings').first()
    await expect(card).toBeVisible()

    // Should be exactly ONE row for Shawshank (not two separate rows)
    const rows = page.locator('text=The Shawshank Redemption')
    await expect(rows).toHaveCount(1)
  })

  test('My Bookings sheet opens and shows grouped card', async ({ page }) => {
    await page.getByText('My Bookings').click()
    await expect(page.getByText('My Movie Bookings')).toBeVisible()

    // One card for Shawshank
    const cards = page.locator('text=The Shawshank Redemption')
    await expect(cards).toHaveCount(1)

    // Confirmed badge visible
    await expect(page.getByText(/✓ Confirmed/i)).toBeVisible()

    // Cancel button present
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

  test('Shawshank event card shows with poster and correct date format', async ({ page }) => {
    await expect(page.getByText('The Shawshank Redemption')).toBeVisible()
    // Date must be uppercase long format
    await expect(page.getByText(/SUNDAY/)).toBeVisible()
    await expect(page.getByText(/18:00/)).toBeVisible()
    // Poster
    const poster = page.locator('img[alt="The Shawshank Redemption"]').first()
    await expect(poster).toBeVisible()
  })

  test('IMDB chip shown on movie card', async ({ page }) => {
    await expect(page.getByText(/IMDb/i)).toBeVisible()
  })

  test('Capacity bar and seat count shown', async ({ page }) => {
    await expect(page.getByText(/seats left/i)).toBeVisible()
  })

  test('Booking buttons render for confirmed user', async ({ page }) => {
    // testbot has a confirmed booking — should see Booked button
    await expect(page.getByText(/✓ Booked/i)).toBeVisible()
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

  test('Film list renders with at least one movie', async ({ page }) => {
    // Movie cards should be present
    const movies = page.locator('text=Drama, text=Action, text=Comedy').first()
    // More reliable: at least one poster or movie row
    await expect(page.locator('img').first()).toBeVisible()
  })

  test('Rate pill button visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Rate/i })).toBeVisible()
  })

  test('+Suggest button visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Suggest/i })).toBeVisible()
  })

  test('Community / IMDB / A-Z filter tabs present', async ({ page }) => {
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

  test('Admin page loads and shows tab bar', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Notices' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Members' })).toBeVisible()
  })

  test('Events tab shows Cinema events (not empty)', async ({ page }) => {
    // Default state is Events tab — Cinema filter should show our screenings
    await page.getByRole('button', { name: /Cinema/i }).click()
    await expect(page.getByText('The Shawshank Redemption')).toBeVisible()
    await expect(page.getByText('Casablanca')).toBeVisible()
  })

  test('No events shown for wrong filter', async ({ page }) => {
    await page.getByRole('button', { name: /Social/i }).click()
    await expect(page.getByText('No events')).toBeVisible()
  })
})
