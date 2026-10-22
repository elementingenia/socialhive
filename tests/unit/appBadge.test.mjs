import assert from "node:assert/strict"
import { badgeValue } from "../../lib/appBadge.js"

let n = 0
const t = (name, fn) => { fn(); n++; }
t("positive count passes through", () => assert.equal(badgeValue(3), 3))
t("zero clears", () => assert.equal(badgeValue(0), 0))
t("negative clears", () => assert.equal(badgeValue(-2), 0))
t("undefined/null clear", () => { assert.equal(badgeValue(undefined), 0); assert.equal(badgeValue(null), 0) })
t("string number", () => assert.equal(badgeValue("4"), 4))
t("fraction floors", () => assert.equal(badgeValue(2.7), 2))
t("garbage clears", () => assert.equal(badgeValue("abc"), 0))
console.log(`appBadge: ${n} passed`)
