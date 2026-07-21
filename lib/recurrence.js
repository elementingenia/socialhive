// Pure date engine for repeatable events. Scope: Social_Hive_Recurring_Events_Scope.md §4/§5.
//
// Deliberately I/O-free and timezone-free: everything is computed on plain
// Y/M/D integers via Date.UTC and returned as 'YYYY-MM-DD' strings, matching how
// events.event_date is stored (a local calendar DATE, not a timestamp). Because
// the time-of-day lives separately in events.event_time, a 7:00pm event stays
// 7:00pm across the NSW DST boundary — there is no instant being shifted.
//
// Being pure is the point: this is the part most likely to hide subtle bugs, so
// it is fully unit-tested (tests/unit/recurrence.test.mjs).

export const MAX_OCCURRENCES = 12          // hard cap regardless of horizon (§5)
export const HORIZON_CHOICES = [3, 6, 12]  // months — the EC's gated choice (§5)
export const RULE_TYPES = ["weekly", "fortnightly", "monthly_date", "monthly_weekday"]

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const ORDINAL_NAMES = { 1: "first", 2: "second", 3: "third", 4: "fourth", last: "last" }

// ── plain calendar helpers (UTC so no local DST drift) ───────────────────────
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d))         // m is 1-12
const iso = (dt) => dt.toISOString().slice(0, 10)
const parse = (s) => { const [y, m, d] = String(s).split("-").map(Number); return utc(y, m, d) }
const dow = (dt) => dt.getUTCDay()                                // 0=Sun … 6=Sat
const addDays = (dt, n) => new Date(dt.getTime() + n * 86400000)
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const addMonths = (y, m, n) => { const t = y * 12 + (m - 1) + n; return [Math.floor(t / 12), (t % 12) + 1] }

// Nth weekday of a month. ordinal 1-4 or "last". Returns null if it doesn't
// exist (e.g. a 5th Tuesday), so that month is simply skipped.
function nthWeekdayOfMonth(y, m, weekday, ordinal) {
  if (ordinal === "last") {
    const last = daysInMonth(y, m)
    for (let d = last; d > last - 7; d--) if (dow(utc(y, m, d)) === weekday) return utc(y, m, d)
    return null
  }
  const firstDow = dow(utc(y, m, 1))
  const firstMatch = 1 + ((weekday - firstDow + 7) % 7)
  const day = firstMatch + (Number(ordinal) - 1) * 7
  return day <= daysInMonth(y, m) ? utc(y, m, day) : null
}

// Day-of-month, honouring the EC's month_end_policy for short months (§4).
function monthlyDate(y, m, day, policy) {
  const dim = daysInMonth(y, m)
  if (day <= dim) return utc(y, m, day)
  return policy === "skip" ? null : utc(y, m, dim)   // default: clamp to last day
}

/**
 * Generate occurrence dates for a series.
 * @param series { rule_type, rule_config, start_date, month_end_policy, horizon_months }
 * @param opts   { from?: 'YYYY-MM-DD' (default today/start), count?: number }
 * @returns string[] of 'YYYY-MM-DD', ascending, capped at MAX_OCCURRENCES.
 */
export function generateOccurrences(series, opts = {}) {
  const cfg = series?.rule_config || {}
  const policy = series?.month_end_policy || "clamp"
  const cap = Math.min(opts.count ?? MAX_OCCURRENCES, MAX_OCCURRENCES)
  if (cap <= 0) return []

  const start = parse(series.start_date)
  const fromRaw = opts.from ? parse(opts.from) : start
  const from = fromRaw.getTime() > start.getTime() ? fromRaw : start

  const months = series?.horizon_months ?? 6
  const [hy, hm] = addMonths(from.getUTCFullYear(), from.getUTCMonth() + 1, months)
  const horizonEnd = utc(hy, hm, Math.min(from.getUTCDate(), daysInMonth(hy, hm)))

  const out = []
  const push = (dt) => {
    if (!dt) return
    if (dt.getTime() < from.getTime()) return
    if (dt.getTime() > horizonEnd.getTime()) return
    const s = iso(dt)
    if (!out.includes(s)) out.push(s)
  }

  if (series.rule_type === "weekly") {
    const set = new Set((cfg.weekdays || []).map(Number))
    if (!set.size) return []
    for (let dt = from; dt.getTime() <= horizonEnd.getTime() && out.length < cap; dt = addDays(dt, 1)) {
      if (set.has(dow(dt))) push(dt)
    }
  } else if (series.rule_type === "fortnightly") {
    const wd = Number(cfg.weekday)
    // Anchor to the first matching weekday on/after start_date, then every 14 days.
    let anchor = start
    while (dow(anchor) !== wd) anchor = addDays(anchor, 1)
    for (let dt = anchor; dt.getTime() <= horizonEnd.getTime() && out.length < cap; dt = addDays(dt, 14)) {
      push(dt)
    }
  } else if (series.rule_type === "monthly_date") {
    const day = Number(cfg.day)
    let [y, m] = [from.getUTCFullYear(), from.getUTCMonth() + 1]
    for (let i = 0; i <= months + 1 && out.length < cap; i++) {
      push(monthlyDate(y, m, day, policy))
      ;[y, m] = addMonths(y, m, 1)
    }
  } else if (series.rule_type === "monthly_weekday") {
    const wd = Number(cfg.weekday)
    const ord = cfg.ordinal === "last" ? "last" : Number(cfg.ordinal)
    let [y, m] = [from.getUTCFullYear(), from.getUTCMonth() + 1]
    for (let i = 0; i <= months + 1 && out.length < cap; i++) {
      push(nthWeekdayOfMonth(y, m, wd, ord))
      ;[y, m] = addMonths(y, m, 1)
    }
  }

  return out.slice(0, cap)
}

/**
 * The single next date matching a rule — used to PRE-FILL the date field for
 * content-defined clubs (Book Club), which store a pattern but generate nothing
 * (scope §7a). Returns null if the rule yields nothing in range.
 */
export function nextOccurrence(series, fromISO) {
  const list = generateOccurrences({ ...series, horizon_months: 12 }, { from: fromISO, count: 1 })
  return list[0] || null
}

/** Plain-English description for the UI ("The last Thursday of each month"). */
export function describeRule(series) {
  const cfg = series?.rule_config || {}
  switch (series?.rule_type) {
    case "weekly": {
      const days = (cfg.weekdays || []).map(Number).sort((a, b) => a - b).map(d => DAY_NAMES[d])
      if (!days.length) return ""
      const list = days.length === 1 ? days[0]
        : days.slice(0, -1).join(", ") + " and " + days[days.length - 1]
      return `Every ${list}`
    }
    case "fortnightly":
      return `Every second ${DAY_NAMES[Number(cfg.weekday)]}`
    case "monthly_date": {
      const d = Number(cfg.day)
      const suffix = d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"
      return `The ${d}${suffix} of each month`
    }
    case "monthly_weekday":
      return `The ${ORDINAL_NAMES[cfg.ordinal] || cfg.ordinal} ${DAY_NAMES[Number(cfg.weekday)]} of each month`
    default:
      return ""
  }
}

/** Does this rule need the short-month prompt? Only days 29-31 (scope §4). */
export function needsMonthEndChoice(series) {
  return series?.rule_type === "monthly_date" && Number(series?.rule_config?.day) >= 29
}
