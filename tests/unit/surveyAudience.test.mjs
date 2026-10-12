import assert from "node:assert/strict"
import {
  areaKey, isTargeted, normalizeAudienceInput, canTargetAudience, ownsWholeAudience,
  isInAudience, canViewSurvey, audienceLabels, notInAudienceReason, audienceRecipientIds,
} from "../../lib/surveyAudience.js"

let n = 0
const t = (name, fn) => { try { fn(); n++ } catch (e) { console.error("FAIL:", name); throw e } }

const CLUB_A = "11111111-1111-1111-1111-111111111111"
const CLUB_B = "22222222-2222-2222-2222-222222222222"
const clubs = new Set([CLUB_A, CLUB_B])
const showTime = { area_type: "hub", hub_type: "movie", club_id: null }
const clubA = { area_type: "club", hub_type: null, club_id: CLUB_A }
const clubB = { area_type: "club", hub_type: null, club_id: CLUB_B }
const perRes = { eligibility_mode: "per_resident" }
const perHouse = { eligibility_mode: "per_household" }

// keys
t("hub key", () => assert.equal(areaKey(showTime), "hub:movie"))
t("club key", () => assert.equal(areaKey(clubA), `club:${CLUB_A}`))
t("bad row has no key", () => assert.equal(areaKey({ area_type: "club" }), null))
t("empty audience = whole community", () => assert.equal(isTargeted([]), false))
t("null audience = whole community", () => assert.equal(isTargeted(null), false))
t("rows = targeted", () => assert.equal(isTargeted([clubA]), true))

// input
t("no audience input = whole community", () => assert.deepEqual(normalizeAudienceInput(undefined, clubs), { ok: true, rows: [] }))
t("Show Time accepted", () => assert.deepEqual(normalizeAudienceInput([{ area_type: "hub", key: "movie" }], clubs).rows, [showTime]))
t("real club accepted", () => assert.deepEqual(normalizeAudienceInput([{ area_type: "club", key: CLUB_A }], clubs).rows, [clubA]))
t("Social refused (no Join list)", () => assert.equal(normalizeAudienceInput([{ area_type: "hub", key: "social" }], clubs).ok, false))
t("Special Events refused", () => assert.equal(normalizeAudienceInput([{ area_type: "hub", key: "special" }], clubs).ok, false))
t("unknown club refused", () => assert.equal(normalizeAudienceInput([{ area_type: "club", key: "nope" }], clubs).ok, false))
t("prototype key refused", () => assert.equal(normalizeAudienceInput([{ area_type: "hub", key: "toString" }], clubs).ok, false))
t("duplicates collapse", () => assert.equal(normalizeAudienceInput([{ area_type: "club", key: CLUB_A }, { area_type: "club", key: CLUB_A }], clubs).rows.length, 1))
t("non-list refused", () => assert.equal(normalizeAudienceInput("x", clubs).ok, false))

// who can target what (answer B)
const owns = new Set([`club:${CLUB_A}`])
t("admin can send to whole community", () => assert.equal(canTargetAudience({ isGlobalManager: true }, []), true))
t("admin can target any group", () => assert.equal(canTargetAudience({ isGlobalManager: true }, [clubB, showTime]), true))
t("Owner can target own club", () => assert.equal(canTargetAudience({ isGlobalManager: false, ownedKeys: owns }, [clubA]), true))
t("Owner can't target someone else's club", () => assert.equal(canTargetAudience({ isGlobalManager: false, ownedKeys: owns }, [clubB]), false))
t("Owner can't mix own + other", () => assert.equal(canTargetAudience({ isGlobalManager: false, ownedKeys: owns }, [clubA, clubB]), false))
t("Owner can't send to whole community", () => assert.equal(canTargetAudience({ isGlobalManager: false, ownedKeys: owns }, []), false))
t("Owner of all areas manages", () => assert.equal(ownsWholeAudience(new Set([`club:${CLUB_A}`, "hub:movie"]), [clubA, showTime]), true))
t("Owner of some areas doesn't manage", () => assert.equal(ownsWholeAudience(owns, [clubA, showTime]), false))
t("whole-community survey never owner-managed", () => assert.equal(ownsWholeAudience(owns, []), false))

// membership (answers A, D)
t("everyone is in a whole-community survey", () => assert.equal(isInAudience(perRes, [], new Set(), new Set()), true))
t("member of picked club is in", () => assert.equal(isInAudience(perRes, [clubA, clubB], new Set([`club:${CLUB_B}`]), new Set()), true))
t("non-member is out", () => assert.equal(isInAudience(perRes, [clubA], new Set(["hub:movie"]), new Set()), false))
t("Show Time follower is in", () => assert.equal(isInAudience(perRes, [showTime], new Set(["hub:movie"]), new Set()), true))
t("household mate counts on per-household survey", () => assert.equal(isInAudience(perHouse, [clubA], new Set(), new Set([`club:${CLUB_A}`])), true))
t("household mate doesn't count on per-resident survey", () => assert.equal(isInAudience(perRes, [clubA], new Set(), new Set([`club:${CLUB_A}`])), false))

// visibility (answer C)
t("non-member can't see by default", () => assert.equal(canViewSurvey({ survey: { visible_to_all: false }, audienceRows: [clubA], inAudience: false, canManageThis: false }), false))
t("non-member sees when visible to all", () => assert.equal(canViewSurvey({ survey: { visible_to_all: true }, audienceRows: [clubA], inAudience: false, canManageThis: false }), true))
t("manager always sees", () => assert.equal(canViewSurvey({ survey: {}, audienceRows: [clubA], inAudience: false, canManageThis: true }), true))
t("member sees", () => assert.equal(canViewSurvey({ survey: {}, audienceRows: [clubA], inAudience: true, canManageThis: false }), true))
t("whole-community visible to all", () => assert.equal(canViewSurvey({ survey: {}, audienceRows: [], inAudience: true, canManageThis: false }), true))

// labels
t("labels A-Z", () => assert.deepEqual(audienceLabels([showTime, clubA], { [CLUB_A]: "Book Club" }), ["Book Club", "Show Time"]))
t("reason names groups", () => assert.equal(notInAudienceReason(["Book Club"]), "This survey is for members of Book Club. Join one of them to take part."))

// recipients
const active = [
  { id: "a", house_number: "12" }, { id: "b", house_number: "Unit 12" },
  { id: "c", house_number: "40" }, { id: "d", house_number: null },
]
t("recipients = active audience, de-duped", () => assert.deepEqual(audienceRecipientIds({ memberIds: ["a", "a", "c", "gone"], activeMembers: active, perHousehold: false }).sort(), ["a", "c"]))
t("per-household adds same-house mates", () => assert.deepEqual(audienceRecipientIds({ memberIds: ["a"], activeMembers: active, perHousehold: true }).sort(), ["a", "b"]))
t("no house number adds nobody", () => assert.deepEqual(audienceRecipientIds({ memberIds: ["d"], activeMembers: active, perHousehold: true }), ["d"]))

console.log(`surveyAudience: ${n} passed`)
