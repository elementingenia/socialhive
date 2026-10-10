// My Stuff (Iain, 2026-10-10).
// Scope: "Element Happenings – My Stuff – Scope Answered" (Google Doc,
// Drive folder 0ADckvqFBnPA7Uk9PVA).
//
// Pure rules only (no I/O) so they run under plain Node in
// tests/unit/myStuff.test.mjs. app/api/my-stuff is the only writer.
//
// People and Documents are pinned with the 📌 button. Groups & Clubs and
// repeating events fill in on their own from what the resident has joined
// and booked (agreed follow-up 1).

export const PIN_TYPES = ["member", "contact", "document"]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Validate a pin/unpin request. Error string, or null. */
export function validatePin({ action, item_type, item_id } = {}) {
  if (action !== "pin" && action !== "unpin") return "Unknown action"
  if (!PIN_TYPES.includes(item_type)) return "That can't be pinned"
  if (!UUID_RE.test(String(item_id || ""))) return "That can't be pinned"
  return null
}

/** The key a Contacts card uses for a person ("m-<id>" / "c-<id>"). */
export function personKey(pin) {
  return pin.item_type === "member" ? `m-${pin.item_id}` : pin.item_type === "contact" ? `c-${pin.item_id}` : null
}

/** "m-<id>" / "c-<id>" back to a pin's type and id. */
export function pinFromPersonKey(key) {
  const m = /^([mc])-(.+)$/.exec(String(key || ""))
  if (!m) return null
  return { item_type: m[1] === "m" ? "member" : "contact", item_id: m[2] }
}

/**
 * Repeating events the resident has a seat on for at least one future date:
 * one row per series, pointing at the NEXT booked date (agreed follow-up 2).
 * `rows` are future, non-archived, booked events that belong to a series:
 *   { id, series_id, event_date, event_time, hub_type, title, showing_name,
 *     content_tba, club_id, club_name, club_slug }
 */
export function bookedSeries(rows = []) {
  const bySeries = new Map()
  const sorted = [...rows].filter(r => r && r.series_id)
    .sort((a, b) => (a.event_date + (a.event_time || "")).localeCompare(b.event_date + (b.event_time || "")))
  for (const r of sorted) {
    if (bySeries.has(r.series_id)) { bySeries.get(r.series_id).dates += 1; continue }
    bySeries.set(r.series_id, {
      series_id: r.series_id,
      name: seriesName(r),
      hub_type: r.hub_type,
      club_id: r.club_id || null,
      club_name: r.club_name || null,
      club_slug: r.club_slug || null,
      next_event_id: r.id,
      next_date: r.event_date,
      next_time: r.event_time || null,
      dates: 1,
    })
  }
  return [...bySeries.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** A series' name: its Show Time showing name, else the event's own title. */
export function seriesName(r) {
  const name = (r.showing_name || "").trim()
  if (name) return name
  if (r.content_tba) return "Repeating showing"
  return (r.title || "").trim() || (r.club_name ? `${r.club_name} event` : "Repeating event")
}

/** The tile's one-line summary. */
export function summaryLine({ series = 0, clubs = 0, people = 0, documents = 0 } = {}) {
  const parts = []
  const p = (n, one, many) => n > 0 && parts.push(`${n} ${n === 1 ? one : many}`)
  p(series, "repeating event", "repeating events")
  p(clubs, "group or club", "groups & clubs")
  p(people, "person", "people")
  p(documents, "document", "documents")
  return parts.length ? parts.join(" · ") : "Pin people and documents to find them here"
}
