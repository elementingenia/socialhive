# Social Hive — Testing Protocol

## Mandatory rules (non-negotiable)

1. **`npm run build` must pass before every commit** — catches compile errors and broken imports
2. **`npm test` must pass before every commit** — catches UI regressions
3. If a test fails after your change, fix the code (not the test) unless the behaviour change is intentional
4. If intentional behaviour changes, update the test to match the new expected behaviour

---

## Running tests locally

```bash
# One-time setup — install Playwright browser
npx playwright install chromium

# Run full test suite (requires dev server running on :3000)
npm run dev &
BASE_URL=http://localhost:3000 npm test

# Or run against production
BASE_URL=https://socialhive.vercel.app npm test

# Run with headed browser (see what's happening)
BASE_URL=http://localhost:3000 npm run test:headed

# Run a single file
BASE_URL=http://localhost:3000 npx playwright test tests/e2e/movies.spec.js
```

---

## Test user

| Username | PIN  | Role  | Notes |
|----------|------|-------|-------|
| testbot  | 9999 | Admin | Has 2x confirmed seats on Shawshank Redemption |

Do not delete `testbot` or its Shawshank booking — tests depend on them.

---

## What's covered

| Test file | Area | Key assertions |
|-----------|------|----------------|
| `auth.setup.js` | Login | testbot can sign in, device prompt dismissed |
| `movies.spec.js` | Movies Home | Next Screening renders with poster + IMDB chip |
| | | My Bookings card — one row per movie, no duplicates |
| | | My Bookings sheet — grouped, Cancel button present |
| | | Rate a Film swiper present |
| `movies.spec.js` | Scheduled | Events listed, uppercase date, poster, seat count |
| | | Booking buttons shown for confirmed user |
| `movies.spec.js` | Suggestions | List loads, Rate pill + Suggest button present |
| | | Community/IMDB/A–Z filter tabs present |
| `movies.spec.js` | Admin | Events tab shows Cinema events |
| | | Empty state for non-cinema filter |

---

## Adding new tests

When you build a new feature, add a test for it in `tests/e2e/`. Keep tests
focused on what the user sees and interacts with — not implementation details.

Template for a new page test:

```js
const { test, expect } = require('@playwright/test')

test.describe('My Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/my-page')
    await page.waitForLoadState('networkidle')
  })

  test('key element is visible', async ({ page }) => {
    await expect(page.getByText('Expected heading')).toBeVisible()
  })
})
```

---

## CI (GitHub Actions)

Tests run automatically on every push to `main` and every PR.
If CI fails, the commit should not be considered deployable.

Secrets required in GitHub repo settings:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
