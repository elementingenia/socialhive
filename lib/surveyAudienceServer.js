// Targeted Surveys -- server-side loading for the audience rules in
// lib/surveyAudience.js. Every Surveys route goes through these so the
// audience rule lives in one place. Membership is read LIVE (answer A).
import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { normalizeHouseNumber } from "@/lib/surveys"
import {
  AUDIENCE_HUBS, areaKey, isTargeted, isInAudience, audienceLabels,
  ownsWholeAudience, audienceRecipientIds,
} from "@/lib/surveyAudience"

// { [survey_id]: rows[] } for the given surveys.
export async function loadAudiences(surveyIds) {
  const out = {}
  if (!surveyIds?.length) return out
  const { data } = await supa.from("survey_audiences")
    .select("survey_id, area_type, hub_type, club_id").in("survey_id", surveyIds)
  for (const r of data || []) (out[r.survey_id] = out[r.survey_id] || []).push(r)
  return out
}

export async function clubNamesFor(rowsList) {
  const ids = [...new Set(rowsList.flat().filter(r => r.area_type === "club").map(r => r.club_id))]
  if (!ids.length) return {}
  const { data } = await supa.from("clubs").select("id, name").in("id", ids)
  return Object.fromEntries((data || []).map(c => [c.id, c.name]))
}

// Area keys a set of members have joined.
async function joinedKeys(memberIds) {
  const keys = new Set()
  if (!memberIds?.length) return keys
  const [{ data: clubs }, { data: hubs }] = await Promise.all([
    supa.from("club_members").select("club_id").in("member_id", memberIds),
    supa.from("hub_followers").select("hub_type").in("member_id", memberIds),
  ])
  for (const c of clubs || []) keys.add(`club:${c.club_id}`)
  for (const h of hubs || []) if (AUDIENCE_HUBS[h.hub_type]) keys.add(`hub:${h.hub_type}`)
  return keys
}

// What the viewer has joined, and what anyone at their house number has
// joined (for per-household surveys, answer D). Load once per request.
export async function viewerMembership(member) {
  const viewerKeys = await joinedKeys([member.id])
  let householdKeys = new Set(viewerKeys)
  const house = normalizeHouseNumber(member.house_number)
  if (house) {
    const { data: active } = await supa.from("members").select("id, house_number").eq("status", "active")
    const mates = (active || []).filter(m => m.id !== member.id && normalizeHouseNumber(m.house_number) === house).map(m => m.id)
    if (mates.length) {
      const mateKeys = await joinedKeys(mates)
      householdKeys = new Set([...viewerKeys, ...mateKeys])
    }
  }
  return { viewerKeys, householdKeys }
}

// Area keys this member is an Owner of, limited to targetable areas
// (Show Time + clubs).
export async function ownedAreaKeys(memberId) {
  const { data } = await supa.from("space_owners").select("context_type, context_key").eq("member_id", memberId)
  const keys = new Set()
  for (const o of data || []) {
    if (o.context_type === "club") keys.add(`club:${o.context_key}`)
    else if (o.context_type === "hub" && AUDIENCE_HUBS[o.context_key]) keys.add(`hub:${o.context_key}`)
  }
  return keys
}

// Areas this member may target on a new survey, A-Z: everything for an admin
// or Surveys Owner, otherwise only what they own.
export async function audienceOptions({ isGlobalManager, ownedKeys }) {
  const { data: clubs } = await supa.from("clubs").select("id, name").eq("archived", false)
  const opts = []
  for (const [hub, info] of Object.entries(AUDIENCE_HUBS)) {
    if (isGlobalManager || ownedKeys.has(`hub:${hub}`)) opts.push({ area_type: "hub", key: hub, label: info.label })
  }
  for (const c of clubs || []) {
    if (isGlobalManager || ownedKeys.has(`club:${c.id}`)) opts.push({ area_type: "club", key: c.id, label: c.name })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label))
}

export async function activeClubIds() {
  const { data } = await supa.from("clubs").select("id").eq("archived", false)
  return new Set((data || []).map(c => c.id))
}

// Replace a survey's audience wholesale.
export async function writeAudience(surveyId, rows) {
  const { error: delErr } = await supa.from("survey_audiences").delete().eq("survey_id", surveyId)
  if (delErr) return delErr
  if (!rows.length) return null
  const { error } = await supa.from("survey_audiences").insert(rows.map(r => ({ survey_id: surveyId, ...r })))
  return error || null
}

// Full access picture for one survey + viewer.
export async function surveyAccess(survey, member, { audienceRows, membership } = {}) {
  const rows = audienceRows || (await loadAudiences([survey.id]))[survey.id] || []
  const targeted = isTargeted(rows)
  const mem = targeted ? (membership || await viewerMembership(member)) : null
  const inAudience = !targeted || isInAudience(survey, rows, mem.viewerKeys, mem.householdKeys)
  const names = targeted ? await clubNamesFor([rows]) : {}
  return { rows, targeted, inAudience, labels: audienceLabels(rows, names) }
}

// Is this member an Owner of every area in the survey's audience? (They then
// manage it like a Surveys Owner, answer B.)
export async function ownsSurveyAudience(memberId, surveyId) {
  const rows = (await loadAudiences([surveyId]))[surveyId] || []
  if (!isTargeted(rows)) return false
  return ownsWholeAudience(await ownedAreaKeys(memberId), rows)
}

// Notification recipients: whole community when untargeted, otherwise the
// live audience (+ household mates on a per-household survey).
export async function surveyRecipientIds(survey) {
  const rows = (await loadAudiences([survey.id]))[survey.id] || []
  const { data: activeMembers } = await supa.from("members").select("id, house_number").eq("status", "active")
  if (!isTargeted(rows)) return (activeMembers || []).map(m => m.id)
  const hubTypes = rows.filter(r => r.area_type === "hub").map(r => r.hub_type)
  const clubIds = rows.filter(r => r.area_type === "club").map(r => r.club_id)
  const [{ data: hf }, { data: cm }] = await Promise.all([
    hubTypes.length ? supa.from("hub_followers").select("member_id").in("hub_type", hubTypes) : Promise.resolve({ data: [] }),
    clubIds.length ? supa.from("club_members").select("member_id").in("club_id", clubIds) : Promise.resolve({ data: [] }),
  ])
  const memberIds = [...(hf || []), ...(cm || [])].map(r => r.member_id)
  return audienceRecipientIds({ memberIds, activeMembers, perHousehold: survey.eligibility_mode === "per_household" })
}

export { areaKey }
