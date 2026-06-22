const { test: setup, expect } = require('@playwright/test')
const path = require('path')

const AUTH_FILE = path.join(__dirname, '.auth/testbot.json')

setup('authenticate as testbot', async ({ page }) => {
  await page.goto('/login')

  await page.getByPlaceholder(/username/i).fill('testbot')
  await page.getByPlaceholder(/password|pin/i).fill('9999')
  await page.locator('button[type="submit"]').click()

  // Device prompt heading (exact text)
  await expect(page.getByText('Signed in!', { exact: true })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /no, keep/i }).click()

  await page.waitForURL('**/home', { timeout: 10_000 })
  await page.context().storageState({ path: AUTH_FILE })
})
