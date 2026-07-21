// Minimal, deliberately-narrow lint gate. Scope: correctness only (no-undef),
// so it stays noise-free on this never-previously-linted codebase and blocks
// the exact bug class that shipped twice (activeEC, allow_nonresident_guests):
// a reference to a variable that doesn't exist in scope. Style rules are out
// of scope on purpose — widen later if desired.
module.exports = {
  root: true,
  parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } },
  env: { browser: true, node: true, es2022: true },
  globals: { React: "readonly", JSX: "readonly", structuredClone: "readonly" },
  rules: { "no-undef": "error" },
  ignorePatterns: ["node_modules/", ".next/", "public/", "tests/e2e/"]
};
