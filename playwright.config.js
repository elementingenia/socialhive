const { defineConfig, devices } = require('@playwright/test')
const path = require('path')

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 390, height: 844 },
  },

  projects: [
    { name: 'setup', testMatch: '**/auth.setup.js' },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        storageState: path.join(__dirname, 'tests/e2e/.auth/testbot.json'),
      },
      dependencies: ['setup'],
    },
  ],
})
