// Show Time repeating showings (Iain, 2026-10-10).
// Scope: "Element Happenings – Show Time Repeating Showings – Scope Answered"
// (Google Doc, Drive folder 0ADckvqFBnPA7Uk9PVA).
//
// Pure rules only (no I/O) so they run under plain Node in
// tests/unit/showtimeSeries.test.mjs. The writers are
// app/api/screenings/resident (create), app/api/screenings (set content on a
// date), app/api/screenings/series (mute / end) and lib/generateSeriesEvents.
//
// The repeat is anchored to the first date's weekday, so a resident only
// answers "every week / every fortnight / every month" -- never a rule
// builder. That keeps the wizard to plain questions for this audience.

import { generateOccurrences, describeRule } from "./recurrence.js"

export const REPEAT_KINDS = ["weekly", "fortnightly", "monthly"]
export const MAX_DATES_AHEAD = 12      // agreed cap (Iain, 2026-10-10)
export const DEFAULT_DATES_AHEAD = 4
export const SHOWING_NAME_MAX = 80
export const TBA_TITLE = "To be announced"
export const TBA_NUDGE_DAYS = 3        // coordinator nudge, days before the date

function weekdayOf(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}
function dayOf(dateStr) {
  return Number(String(dateStr).split("-")[2])
}

/**
 * The event_series rule for a repeat kind, anchored to the first date.
 * monthly = the same weekday each month (2nd Friday, last Sunday...). A date
 * in the 29th-31st is always the last one of its weekday that month.
 */
export function ruleFor(kind, firstDate) {
  const wd = weekdayOf(firstDate)
  if (kind === "weekly") return { rule_type: "weekly", rule_config: { weekdays: [wd] } }
  if (kind === "fortnightly") return { rule_type: "fortnightly", rule_config: { weekday: wd } }
  if (kind === "monthly") {
    const n = Math.ceil(dayOf(firstDate) / 7)
    return { rule_type: "monthly_weekday", rule_config: { ordinal: n >= 5 ? "last" : n, weekday: wd } }
  }
  return null
}

/** "Every second Friday", "The 2nd Friday of each month"... */
export function describeRepeat(kind, firstDate) {
  const rule = ruleFor(kind, firstDate)
  return rule ? describeRule(rule) : ""
}

/** The dates a run will create, first date first. */
export function planDates({ kind, firstDate, count }) {
  const rule = ruleFor(kind, firstDate)
  if (!rule || !firstDate) return []
  const n = Math.max(1, Math.min(MAX_DATES_AHEAD, Number(count) || DEFAULT_DATES_AHEAD))
  return generateOccurrences(
    { ...rule, start_date: firstDate, month_end_policy: "clamp", horizon_months: 12 },
    { count: n })
}

/** Validate the repeat part of a wizard submission. Error string, or null. */
export function validateRepeat(repeat) {
  if (!repeat) return null
  if (!REPEAT_KINDS.includes(repeat.kind)) return "Choose how often it repeats"
  const n = Number(repeat.dates_ahead)
  if (!Number.isInteger(n) || n < 2 || n > MAX_DATES_AHEAD) {
    return `Choose between 2 and ${MAX_DATES_AHEAD} dates`
  }
  if (typeof repeat.keep_rolling !== "boolean") return "Say whether to keep it rolling"
  const name = (repeat.showing_name || "").trim()
  if (name.length > SHOWING_NAME_MAX) return `Keep the name under ${SHOWING_NAME_MAX} characters`
  return null
}

/**
 * Who hears that a date's content has been set:
 *   Show Time members, minus anyone who muted this series,
 *   plus everyone booked on that date (always -- it's their booking, agreed),
 *   minus the person who set it.
 */
export function contentSetRecipients({ followerIds = [], mutedIds = [], bookerIds = [], excludeIds = [] } = {}) {
  const muted = new Set(mutedIds.filter(Boolean))
  const skip = new Set(excludeIds.filter(Boolean))
  const out = new Set()
  for (const id of followerIds) if (id && !muted.has(id)) out.add(id)
  for (const id of bookerIds) if (id) out.add(id)
  for (const id of skip) out.delete(id)
  return [...out]
}

/** Does this edit choose content for a date that was To be announced? */
export function isContentBeingSet({ wasTba, movieId, showingTitle }) {
  if (!wasTba) return false
  return !!movieId || !!(showingTitle || "").trim()
}

/** A To be announced date within TBA_NUDGE_DAYS that hasn't been nudged yet. */
export function needsTbaNudge(event, today, inDays) {
  if (!event || !event.content_tba || event.archived || event.tba_nudged_at) return false
  return event.event_date >= today && event.event_date <= inDays
}

/** Notification line for a date whose content was just set. */
export function contentSetMessage({ showingName, title, when }) {
  const name = (showingName || "").trim()
  return `New showing: ${name ? `${name} — ` : ""}${title}${when ? ` — ${when}` : ""}`
}
