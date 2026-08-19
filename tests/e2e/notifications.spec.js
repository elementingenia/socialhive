const { test, expect } = require('@playwright/test')
const { createTestbotNotification } = require('./helpers')

// ── Notifications ──────────────────────────────────────────────────────────────
// This test creates a fresh notification per run rather than depending on a
// persistent fixture row — opening the drawer marks things read server-side,
// which would make a static fixture row a one-shot test that goes stale after
// the first CI run ever exercises it.
//
// Updated 2026-08-19: PR #80 (2026-08-14, the Alerts Bell hot-fix) deliberately
// made the bell button PERMANENT chrome — it used to unmount entirely at zero
// unread (notifCount > 0 ? <button> : null), which was the actual bug PR #80
// fixed (a resident with unread alerts opened the drawer, which marked
// everything read, and the bell itself vanished with no way back in). This
// test's original assertion (`not.toBeVisible()` on the bell after reading)
// was written for the OLD, since-fixed behaviour and has been failing on
// `main` itself ever since PR #80 merged — not a real regression, just a
// test that never got updated alongside the intentional design change it
// contradicts. Now asserts what PR #80 actually shipped: the bell button
// stays visible always; only its numeric badge (data-testid="notif-badge",
// components/Header.js) is conditional on unread count.
test.describe('Notifications', () => {
  test('Bell shows unread badge, drawer displays it, opening clears the badge', async ({ page }) => {
    const message = await createTestbotNotification()

    await page.goto('/home')
    await page.waitForLoadState('networkidle')

    const bell = page.getByRole('button', { name: 'Notifications' })
    await expect(bell).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('notif-badge')).toBeVisible()

    await bell.click()
    await expect(page.getByText('Notifications', { exact: true })).toBeVisible()
    await expect(page.getByText(message)).toBeVisible()

    // Opening the drawer marks everything read server-side — reload and confirm
    // the badge is gone, but the bell itself (permanent chrome since PR #80)
    // remains.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(bell).toBeVisible()
    await expect(page.getByTestId('notif-badge')).not.toBeVisible()
  })
})
