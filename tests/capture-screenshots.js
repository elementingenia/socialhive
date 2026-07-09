const { chromium } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

const BASE = 'https://www.thesocialhive.com.au'
const OUT  = path.join(__dirname, '../public/help')
const AUTH = path.join(__dirname, 'e2e/.auth/testbot.json')

async function shot(page, name, url, waitFor, action) {
  await page.goto(BASE + url, { waitUntil: 'networkidle' })
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 10000 }).catch(() => {})
  if (action) await action(page)
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: false })
  console.log('✓', name)
}

;(async () => {
  const browser = await chromium.launch()

  // ── Unauthenticated screenshots ──
  const anonCtx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const anonPage = await anonCtx.newPage()

  await shot(anonPage, '01-login',    '/login', 'input[placeholder*="username" i]')
  // Click Register tab
  await shot(anonPage, '02-register', '/login', 'text=Register', async p => {
    await p.getByText('Register').click()
    await p.waitForTimeout(300)
  })
  // Click Change Password tab
  await shot(anonPage, '03-change-password', '/login', 'text=Change Password', async p => {
    await p.getByText('Change Password').click()
    await p.waitForTimeout(300)
  })
  await anonCtx.close()

  // ── Authenticated screenshots ──
  const authCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: AUTH,
  })
  const p = await authCtx.newPage()

  // Suppress nudge
  await p.addInitScript(() => {
    localStorage.setItem('shive_profile_nudge_permanent', '1')
    localStorage.setItem('shive_login_ts', Date.now().toString())
  })

  await shot(p, '04-home',            '/home',              'text=Welcome')
  await shot(p, '05-profile',         '/home',              null, async pg => {
    // Header's account pill opens a dropdown (Update Profile / Change PIN / Sign
    // Out) — the profile screenshot needs the actual ProfileSlideOver panel, not
    // just that dropdown, so click through both steps.
    await pg.getByLabel('Account menu').click()
    await pg.getByText('Update Profile').click()
    await pg.waitForSelector('text=My Profile', { timeout: 5000 }).catch(() => {})
    await pg.waitForTimeout(400)
  })

  // Movies
  await shot(p, '06-movies-home',     '/movies',            'text=Next Screening')
  await shot(p, '07-screenings',      '/screenings',        'text=Upcoming')
  await shot(p, '08-library',         '/library',           'text=VIEWING SUGGESTIONS')
  await shot(p, '09-dvd',             '/dvd',               null)

  // Screenings slideout
  await shot(p, '10-screening-slideout', '/screenings', null, async pg => {
    const tile = pg.locator('[style*="border-radius"]').filter({ hasText: /Book|Booked/i }).first()
    await tile.click()
    await pg.waitForTimeout(800)
  })

  // Social
  await shot(p, '11-social-home',     '/social',            null)
  await shot(p, '12-social-events',   '/social/events',     null)
  await shot(p, '13-social-slideout', '/social/events',     null, async pg => {
    await pg.locator('[style*="border-radius"]').first().click()
    await pg.waitForTimeout(800)
  })

  // Book Club
  await shot(p, '14-bookclub-home',   '/bookclub',          null)
  await shot(p, '15-bookclub-suggest','/bookclub/suggestions', null)

  // Bar
  await shot(p, '16-bar',             '/bar',               null)

  // Calendar
  await shot(p, '17-calendar',        '/calendar',          null)

  // Bookings
  await shot(p, '18-bookings',        '/bookings',          null)

  await authCtx.close()
  await browser.close()
  console.log('\nAll screenshots saved to public/help/')
})()
