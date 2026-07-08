const { test, expect } = require('@playwright/test')
const { createTestbotNotification } = require('./helpers')

// ── Notifications ──────────────────────────────────────────────────────────────
// The bell only renders when there's an unread count (see components/Header.js),
// so this test creates a fresh notification per run rather than depending on a
// persistent fixture row — opening the drawer marks things read server-side,
// which would make a static fixture row a one-shot test that goes stale after
// the first CI run ever exercises it.
test.describe('Notifications', () => {
  test('Bell shows unread badge, drawer displays it, opening clears the badge', async ({ page }) => {
    const message = await createTestbotNotification()

    await page.goto('/home')
    await page.waitForLoadState('networkidle')

    // Bell only renders when notifCount > 0 — this itself proves the badge is live
    const bell = page.getByRole('button', { name: 'Notifications' })
    await expect(bell).toBeVisible({ timeout: 10000 })

    await bell.click()
    await expect(page.getByText('Notifications', { exact: true })).toBeVisible()
    await expect(page.getByText(message)).toBeVisible()

    // Opening the drawer marks everything read server-side — reload and confirm
    // the badge (and therefore the bell itself, which only renders when unread
    // count > 0) is gone.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: 'Notifications' })).not.toBeVisible()
  })
})
