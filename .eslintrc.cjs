// Correctness-focused lint gate for a codebase that was never previously linted.
// Extends eslint:recommended (which brings no-dupe-keys, no-unreachable,
// no-dupe-args, no-dupe-else-if, use-isnan, valid-typeof, no-unsafe-negation,
// etc. — the rules that catch real bugs like the activeEC undefined-ref and the
// duplicate event-payload keys) but turns OFF the high-noise / stylistic rules
// so a red run always means a genuine correctness problem, never style drift.
module.exports = {
  root: true,
  parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } },
  env: { browser: true, node: true, es2022: true },
  globals: { React: "readonly", JSX: "readonly", structuredClone: "readonly" },
  extends: "eslint:recommended",
  plugins: ["react"],
  settings: { react: { version: "detect" } },
  rules: {
    "no-unused-vars": "off",
    "no-empty": "off",
    "no-useless-escape": "off",
    "no-constant-condition": ["error", { checkLoops: false }],
    "no-undef": "error",
    // Core no-undef does NOT catch an undefined JSX component (<Foo /> with no
    // import) -- that shipped a runtime crash once (movies/page.js, 2026-07-21).
    // jsx-no-undef closes that exact gap.
    "react/jsx-no-undef": "error",
    "react/jsx-uses-vars": "error",
    // 2026-08-09: `X.toISOString().split('T')[0]` / `.slice(0,10)` was used
    // ad hoc at 16+ call sites to derive "today" -- toISOString() is UTC, so
    // this silently returns the WRONG calendar day in Australia/Sydney for
    // part or all of every day (see lib/date.js's header comment for the
    // live symptom this caused). Only lib/date.js itself is allowed to do
    // this math -- everywhere else must import sydneyTodayStr() etc.
    "no-restricted-syntax": [
      "error",
      {
        selector: "CallExpression[callee.object.callee.property.name='toISOString'][callee.property.name=/^(split|slice)$/]",
        message: "Don't derive a date-only string from toISOString() directly \u2014 it's UTC and returns the wrong calendar day in Australia/Sydney for part or all of every day. Use sydneyTodayStr() / sydneyDateStrPlusDays() from lib/date.js instead."
      }
    ]
  },
  ignorePatterns: ["node_modules/", ".next/", "public/", "tests/e2e/"],
  overrides: [
    {
      // The one file allowed to do this math -- it's the canonical implementation.
      files: ["lib/date.js"],
      rules: { "no-restricted-syntax": "off" }
    },
    {
      // Pure calendar-arithmetic engine (recurring events) -- deliberately
      // timezone-free by design (see its own header comment): it only ever
      // formats Date objects it built itself from Date.UTC(y,m,d) plain
      // integers, never the real "now" or a real timezone, so it doesn't
      // have the bug this rule exists to catch. Confirmed 2026-08-09.
      files: ["lib/recurrence.js"],
      rules: { "no-restricted-syntax": "off" }
    }
  ]
};
