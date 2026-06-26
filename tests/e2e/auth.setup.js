const { test: setup, expect } = require('@playwright/test')
const path = require('path')

const AUTH_FILE = path.join(__dirname, '.auth/testbot.json')

setup('authenticate as testbot', async ({ page }) => {
  await page.goto('/login')

  await page.getByPlaceholder(/username/i).fill('testbot')
  await page.getByPlaceholder(/password|pin/i).fill('9999')
  await page.locator('button[type="submit"]').click()

  await page.waitForURL('**/home', { timeout: 10_000 })

  // Permanently dismiss profile nudge so it never blocks clicks in tests
  await page.evaluate(() => {
    localStorage.setItem('shive_profile_nudge_permanent', '1')
    // Set login timestamp so 14-day guard doesn't fire during tests
    localStorage.setItem('shive_login_ts', Date.now().toString())
  })

  await page.context().storageState({ path: AUTH_FILE })
})
