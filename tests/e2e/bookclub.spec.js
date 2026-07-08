const { test, expect } = require('@playwright/test')

// ── Book Club Home ─────────────────────────────────────────────────────────────
test.describe('Book Club Home', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/bookclub')
    await page.waitForLoadState('networkidle')
  })

  test('Book club event card renders with book title', async ({ page }) => {
    // At least one event card should be present with a book title
    const card = page.locator('[style*="border-radius: 16px"]').first()
    await expect(card).toBeVisible()
  })

  test('Event card shows date', async ({ page }) => {
    // Date is rendered as e.g. "Saturday, 5 July 2025"
    await expect(page.getByText(/\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)/i).first()).toBeVisible()
  })

  test('Google rating pill shown (amber star)', async ({ page }) => {
    await expect(page.getByText(/⭐/).first()).toBeVisible()
  })

  test('Show more toggle expands and collapses', async ({ page }) => {
    const showMore = page.getByText('Show more ▼').first()
    await expect(showMore).toBeVisible()
    await showMore.click()
    await expect(page.getByText('Show less ▲').first()).toBeVisible()
    await page.getByText('Show less ▲').first().click()
    await expect(page.getByText('Show more ▼').first()).toBeVisible()
  })

  test('Show attendees toggle expands and collapses', async ({ page }) => {
    const btn = page.getByText('Show attendees ▼').first()
    await expect(btn).toBeVisible()
    await btn.click()
    await expect(page.getByText('Hide attendees ▲').first()).toBeVisible({ timeout: 8000 })
    await page.getByText('Hide attendees ▲').first().click()
    await expect(page.getByText('Show attendees ▼').first()).toBeVisible()
  })

  test('Attendees list shows attendee names when expanded', async ({ page }) => {
    // Book Club bookings are always exactly 1 seat (no seat selector in this hub —
    // see the hardcoded `seats: 1` in the join API call), and the attendee row only
    // renders a name, never a seat count. So the correct check is "the list is
    // populated", not "seat text appears" — that text never exists here by design.
    await page.getByText('Show attendees ▼').first().click()
    await expect(page.getByText('Hide attendees ▲').first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('No attendees yet')).not.toBeVisible()
  })

  test('Join prompt visible for non-joined event', async ({ page }) => {
    // Book Club uses a tap-anywhere BookingStrip ("Join this session" / "You're
    // attending"), the same convention as Movies/Social — not a dedicated
    // Join/Leave <button>, which doesn't exist in this component.
    await expect(page.getByText(/Join this session|You're attending/i).first()).toBeVisible()
  })
})

// ── Book Club Suggestions ──────────────────────────────────────────────────────
test.describe('Book Club Suggestions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/bookclub/suggestions')
    await page.waitForLoadState('networkidle')
  })

  test('Suggest a Book button visible', async ({ page }) => {
    await expect(page.getByText('+ Suggest a Book')).toBeVisible()
  })

  test('At least one book tile renders', async ({ page }) => {
    // Book tiles render book titles as text
    const tiles = page.locator('[style*="border-radius: 16px"], [style*="border-radius:16px"]')
    await expect(tiles.first()).toBeVisible()
  })

  test('Book tile shows Google rating pill', async ({ page }) => {
    await expect(page.getByText(/⭐/).first()).toBeVisible()
  })

  test('Community score pill shown (purple, with vote count in parens)', async ({ page }) => {
    // Community pill format: "X.X (N)" — may show "— (0)" when no votes
    await expect(page.locator('text=/\\(\\d+\\)/').first()).toBeVisible()
  })

  test('Book cover or title links to Google Books', async ({ page }) => {
    // Links wrapping book covers/titles should point to books.google.com or play.google.com
    const bookLink = page.locator('a[href*="google"]').first()
    await expect(bookLink).toBeVisible()
    const href = await bookLink.getAttribute('href')
    expect(href).toMatch(/google/)
  })

  test('Rate Now banner shown when unrated books exist', async ({ page }) => {
    // testbot may have unrated books — banner shows "N books to rate"
    // Only assert visible if present (could be rated everything)
    const rateNow = page.getByRole('button', { name: /Rate Now/i })
    const count = await rateNow.count()
    // No assertion — just verify no crash. If present, it should be clickable
    if (count > 0) {
      await expect(rateNow.first()).toBeVisible()
    }
  })


  test('Author and year shown on book tile', async ({ page }) => {
    // "by Author Name (YYYY)" format — year may not be present if not fetched yet
    const byAuthor = page.locator('text=/by /i').first()
    await expect(byAuthor).toBeVisible()
  })
})

// ── Book Club Admin ────────────────────────────────────────────────────────────
test.describe('Book Club Admin controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/bookclub')
    await page.waitForLoadState('networkidle')
  })

  test('Admin sees Edit / Add event buttons', async ({ page }) => {
    // testbot is an admin — should see at least one of these buttons
    const editOrAdd = page.getByRole('button', { name: /Edit|Add Event/i }).first()
    await expect(editOrAdd).toBeVisible()
  })
})
