// Targeted Surveys (Iain, 2026-10-13) -- pure, dependency-free audience
// rules so they can be unit tested under plain Node
// (tests/unit/surveyAudience.test.mjs). Server-side data loading lives in
// lib/surveyAudienceServer.js.
//
// A survey's audience is a list of areas (survey_audiences rows). No rows =
// whole community. Only areas with a Join list can be targeted: Show Time
// (hub_followers) and every Group & Club (club_members). Social, Special
// Events and Library have no Join list, so they can't be picked (answer E).
//
// Area key format, used everywhere below: "hub:<hub_type>" or "club:<club_id>".

import { HUBS_WITH_MEMBERS } from "./hubNotices.js"
import { normalizeHouseNumber } from "./surveys.js"

export const AUDIENCE_HUBS = HUBS_WITH_MEMBERS // { movie: { label: "Show Time", ... } }

export function areaKey(row) {
  if (!row) return null
  if (row.area_type === "hub" && row.hub_type) return `hub:${row.hub_type}`
  if (row.area_type === "club" && row.club_id) return `club:${row.club_id}`
  return null
}

export function isTargeted(audienceRows) {
  return Array.isArray(audienceRows) && audienceRows.length > 0
}

// Clean an audience from a request body: [{ area_type, key }] where key is a
// hub_type or a club_id. Drops anything unknown, de-duplicates. Returns
// { ok, rows, error }. clubIds = Set of real, unarchived club ids.
export function normalizeAudienceInput(input, clubIds) {
  if (input == null) return { ok: true, rows: [] }
  if (!Array.isArray(input)) return { ok: false, error: "audience must be a list" }
  const seen = new Set()
  const rows = []
  for (const a of input) {
    const type = a?.area_type
    const key = a?.key != null ? String(a.key) : ""
    let row = null
    if (type === "hub" && Object.prototype.hasOwnProperty.call(AUDIENCE_HUBS, key)) {
      row = { area_type: "hub", hub_type: key, club_id: null }
    } else if (type === "club" && clubIds && clubIds.has(key)) {
      row = { area_type: "club", hub_type: null, club_id: key }
    } else {
      return { ok: false, error: "One or more selected groups can't be targeted" }
    }
    const k = areaKey(row)
    if (!seen.has(k)) { seen.add(k); rows.push(row) }
  }
  return { ok: true, rows }
}

// Who may create/target this audience (answer B):
//   - admin or Surveys Owner: any audience, including whole community
//   - an Owner of Show Time or a Group & Club: only areas they own, and
//     never the whole community
// ownedKeys = Set of area keys the member owns.
export function canTargetAudience({ isGlobalManager, ownedKeys }, audienceRows) {
  if (isGlobalManager) return true
  if (!isTargeted(audienceRows)) return false
  return audienceRows.every(r => ownedKeys && ownedKeys.has(areaKey(r)))
}

// Area Owner manages a targeted survey only if they own EVERY area in it --
// owning one club in a three-club survey doesn't hand you the other two.
export function ownsWholeAudience(ownedKeys, audienceRows) {
  return isTargeted(audienceRows) && audienceRows.every(r => ownedKeys && ownedKeys.has(areaKey(r)))
}

// Is a viewer in the audience? viewerKeys = Set of area keys the viewer has
// joined. householdKeys = Set of area keys anyone at the viewer's house
// number has joined (answer D -- only counts on per-household surveys).
export function isInAudience(survey, audienceRows, viewerKeys, householdKeys) {
  if (!isTargeted(audienceRows)) return true
  const keys = audienceRows.map(areaKey)
  if (keys.some(k => viewerKeys && viewerKeys.has(k))) return true
  if (survey?.eligibility_mode === "per_household") {
    return keys.some(k => householdKeys && householdKeys.has(k))
  }
  return false
}

// Can the viewer see this survey at all? Managers and coordinators always;
// otherwise the audience, or anyone if visible_to_all (answer C).
export function canViewSurvey({ survey, audienceRows, inAudience, canManageThis }) {
  if (canManageThis) return true
  if (!isTargeted(audienceRows)) return true
  if (inAudience) return true
  return !!survey?.visible_to_all
}

// "For: Book Club, Show Time" -- A-Z. clubNameById = { [id]: name }.
export function audienceLabels(audienceRows, clubNameById) {
  return (audienceRows || [])
    .map(r => r.area_type === "hub" ? (AUDIENCE_HUBS[r.hub_type]?.label || r.hub_type) : (clubNameById?.[r.club_id] || "A group"))
    .sort((a, b) => a.localeCompare(b))
}

export function notInAudienceReason(labels) {
  const list = (labels || []).join(", ")
  return list
    ? `This survey is for members of ${list}. Join one of them to take part.`
    : "This survey is for members of selected groups only."
}

// Recipients for open/publish notifications: audience members (active only),
// plus -- on a per-household survey -- other active residents at the same
// house number (answer D). Pure: callers pass the raw lists.
export function audienceRecipientIds({ memberIds, activeMembers, perHousehold }) {
  const active = new Map((activeMembers || []).map(m => [m.id, m]))
  const out = new Set((memberIds || []).filter(id => active.has(id)))
  if (perHousehold) {
    const houses = new Set()
    for (const id of out) {
      const h = normHouse(active.get(id)?.house_number)
      if (h) houses.add(h)
    }
    for (const m of active.values()) {
      if (houses.has(normHouse(m.house_number))) out.add(m.id)
    }
  }
  return [...out]
}

// Same household rule as per-household eligibility (lib/surveys.js).
function normHouse(h) {
  return normalizeHouseNumber(h)
}
