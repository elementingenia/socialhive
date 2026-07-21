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
    "react/jsx-uses-vars": "error"
  },
  ignorePatterns: ["node_modules/", ".next/", "public/", "tests/e2e/"]
};
