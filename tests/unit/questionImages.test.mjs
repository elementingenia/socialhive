import assert from "node:assert/strict"
import {
  MAX_IMAGES_PER_MESSAGE, MAX_IMAGE_BYTES, QUESTION_IMAGES_BUCKET,
  validateImageSet, hasContent, photoSuffix, isAllowedImageType,
} from "../../lib/questionImageRules.js"

let n = 0
const t = (name, fn) => { fn(); n++ }
const img = (type = "image/jpeg", size = 300_000) => ({ type, size })

t("limit is 3", () => assert.equal(MAX_IMAGES_PER_MESSAGE, 3))
t("bucket name", () => assert.equal(QUESTION_IMAGES_BUCKET, "question-images"))
t("no images is fine", () => assert.equal(validateImageSet([]), null))
t("undefined list is fine", () => assert.equal(validateImageSet(undefined), null))
t("three images ok", () => assert.equal(validateImageSet([img(), img(), img()]), null))
t("four images rejected", () => assert.match(validateImageSet([img(), img(), img(), img()]), /up to 3/))
t("pdf rejected", () => assert.match(validateImageSet([img("application/pdf")]), /Only photos/))
t("heic accepted", () => assert.equal(validateImageSet([img("image/heic")]), null))
t("type check case-insensitive", () => assert.equal(isAllowedImageType("IMAGE/PNG"), true))
t("empty file rejected", () => assert.match(validateImageSet([img("image/png", 0)]), /empty/))
t("oversize rejected", () => assert.match(validateImageSet([img("image/png", MAX_IMAGE_BYTES + 1)]), /too large/))
t("exact max accepted", () => assert.equal(validateImageSet([img("image/png", MAX_IMAGE_BYTES)]), null))
t("text only has content", () => assert.equal(hasContent("hi", 0), true))
t("photo only has content", () => assert.equal(hasContent("", 1), true))
t("whitespace + no photo is empty", () => assert.equal(hasContent("   ", 0), false))
t("null body + no photo is empty", () => assert.equal(hasContent(null, 0), false))
t("no suffix without photos", () => assert.equal(photoSuffix(0), ""))
t("singular suffix", () => assert.equal(photoSuffix(1), " (1 photo)"))
t("plural suffix", () => assert.equal(photoSuffix(3), " (3 photos)"))

console.log(`questionImages: ${n} passed`)
