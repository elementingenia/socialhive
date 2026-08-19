const { test, expect } = require('@playwright/test')
const { createTestbotNotification } = require('./helpers')

// ── Notifications ──────────────────────────────────────────────────────────────
// This test creates a fresh notification per run rather than depending on a
// persistent fixture row — a static fixture row would go stale the moment
// it's marked read.
//
// Updated 2026-08-19, second pass (Iain: "the daily emails say the E2E CI
// fails — let's address it"). The first pass (same day) only fixed the bell
// visibility assertion (bell is now permanent chrome since PR #80,
// 2026-08-14) but kept the test's older premise that OPENING the drawer
// marks everything read. That premise was already wrong the moment PR #80
// shipped: per components/NotificationsDrawer.js's own comment ("no longer
// marks anything read just for having been opened") and
// session_summary_2026-08-14b.md, PR #80 deliberately replaced "open =
// read" with an explicit per-item ✓ ("Mark as done") or clicking through to
// the matter. Because the test never actually ticked anything, and CI has
// run this same test on every push/schedule since 2026-08-14 without ever
// clearing the notification it created, testbot had accumulated 499 unread
// "[e2e-check-...]" rows (confirmed via a direct query, then deleted as a
// one-time cleanup — see the standing "always tidy production data" rule).
// That's also *why* the badge read "9+" in the failing run: real accumulated
// state, not a flake.
//
// Fixed properly this time: the test now ticks its own notification's ✓
// (mirroring what a real resident does), which both proves the per-item
// acknowledge flow works AND means the test cleans up after itself — no
// more silent accumulation.
test.describe('Notifications', () => {
  test('Bell shows unread badge, drawer displays it, ticking marks it done', async ({ page }) => {
    const message = await createTestbotNotification()

    await page.goto('/home')
    await page.waitForLoadState('networkidle')

    const bell = page.getByRole('button', { name: 'Notifications' })
    await expect(bell).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('notif-badge')).toBeVisible()

    await bell.click()
    await expect(page.getByText('Notifications', { exact: true })).toBeVisible()

    // Scope to this specific notification's row (the smallest element
    // containing both its message text and its own "Mark as done" button) —
    // real unread notifications from actual app activity may legitimately
    // coexist in the list, so asserting against the whole drawer isn't safe.
    const row = page.locator('div')
      .filter({ hasText: message })
      .filter({ has: page.getByRole('button', { name: 'Mark as done' }) })
      .last()
    await expect(row).toBeVisible()

    await row.getByRole('button', { name: 'Mark as done' }).click()
    await expect(row.getByRole('button', { name: 'Mark as done' })).not.toBeVisible({ timeout: 4000 })

    // Reload and confirm the tick persisted server-side — this notification
    // no longer shows up as unread, whatever else may be in the list.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(bell).toBeVisible()
    await bell.click()
    const rowAfterReload = page.locator('div')
      .filter({ hasText: message })
      .filter({ has: page.getByRole('button', { name: 'Mark as done' }) })
    await expect(rowAfterReload).toHaveCount(0)
  })
})
