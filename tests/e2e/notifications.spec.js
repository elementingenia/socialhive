const { test, expect } = require('@playwright/test')
const { createTestbotNotification } = require('./helpers')

// ── Notifications ──────────────────────────────────────────────────────────────
// This test creates a fresh notification per run rather than depending on a
// persistent fixture row — a static fixture row would go stale the moment
// it's marked read.
//
// Updated 2026-08-19, third pass (Iain: "the daily emails say the E2E CI
// fails — let's address it"). Two earlier passes the same day each fixed a
// real thing but didn't land clean:
//   1st pass — corrected the bell-visibility assertion for PR #80's
//      permanent-bell change (2026-08-14), but kept the old premise that
//      opening the drawer still marks everything read. It doesn't anymore.
//   2nd pass — switched to ticking the notification's own "Mark as done"
//      button (matching PR #80's actual per-item design) and found + cleaned
//      499 real accumulated unread test rows on testbot along the way. But
//      it scoped the row via `.filter({ hasText }).filter({ has: button })`,
//      which matches every ANCESTOR div containing the row too, not just the
//      row — harmless before ticking (the row is the deepest/last match),
//      but once ticking removes that row's own button, the ancestors still
//      match (they still contain the message text AND still have OTHER
//      unread notifications' buttons as descendants), so `.last()` silently
//      widened to a multi-button container. Confirmed via a real CI run's
//      "strict mode violation... resolved to 2 elements" error.
// Fixed properly this time: components/NotificationsDrawer.js's row div now
// carries data-testid={`notif-row-${n.id}`}, and createTestbotNotification()
// returns the row's real id — an unambiguous, structurally stable locator
// that doesn't depend on what else happens to be in the list or whether the
// button is still present.
test.describe('Notifications', () => {
  test('Bell shows unread badge, drawer displays it, ticking marks it done', async ({ page }) => {
    const { id, message } = await createTestbotNotification()

    await page.goto('/home')
    await page.waitForLoadState('networkidle')

    const bell = page.getByRole('button', { name: 'Notifications' })
    await expect(bell).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('notif-badge')).toBeVisible()

    await bell.click()
    await expect(page.getByText('Notifications', { exact: true })).toBeVisible()

    const row = page.getByTestId(`notif-row-${id}`)
    await expect(row).toBeVisible()
    await expect(row.getByText(message)).toBeVisible()

    // Tick it done -- opening the drawer no longer marks anything read
    // (2026-08-14, PR #80); only the ✓ or clicking through does.
    await row.getByRole('button', { name: 'Mark as done' }).click()
    await expect(row.getByRole('button', { name: 'Mark as done' })).not.toBeVisible({ timeout: 4000 })

    // Reload and confirm the tick persisted server-side.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(bell).toBeVisible()
    await bell.click()
    await expect(page.getByTestId(`notif-row-${id}`).getByRole('button', { name: 'Mark as done' })).toHaveCount(0)
  })
})
