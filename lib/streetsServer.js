// Server-only helpers for the streets list (migration 122). The browser
// can't read the streets table directly -- everything goes through
// /api/streets or a route that attaches street names for it.
import { sortStreets } from "@/lib/address"

export async function loadStreets(supa) {
  const { data, error } = await supa.from("streets").select("id, name")
  if (error) return []
  return sortStreets(data || [])
}

// Adds `street_name` to rows that carry a street_id. Rows without one get
// null. Used by every route that sends house numbers to the browser.
export async function withStreetNames(supa, rows) {
  const list = rows || []
  if (!list.some(r => r?.street_id)) return list.map(r => ({ ...r, street_name: null }))
  const byId = Object.fromEntries((await loadStreets(supa)).map(s => [s.id, s.name]))
  return list.map(r => ({ ...r, street_name: r?.street_id ? (byId[r.street_id] || null) : null }))
}
