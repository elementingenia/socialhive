// lib/occupancy.js — who lives where, derived from dated occupancies.
//
// Pure functions over rows already fetched; no database access, no I/O.
//
// WHY THERE IS NO households TABLE. Iain, 2026-07-30: "there are then, no new
// requirements on that front beyond what we have aired already. Build the
// behaviour and we can add the table later if we need to." A household is not an
// independent thing that needs its own identity and lifecycle — it is just "the
// set of people whose current occupancy is the same property". Deriving it means
// there is no second copy to fall out of sync, which is the exact failure the
// members/contacts split kept producing.
//
// An occupancy is CURRENT when to_date is null. That is the only definition used
// here, and it matches the partial index in migration 068
// (`occupancies_current ... WHERE to_date IS NULL`), so the hot query is indexed.

const isCurrent = (o) => !!o && !o.to_date

/** Every current occupancy for a property. */
export function currentOccupants (occupancies, propertyId) {
  if (!Array.isArray(occupancies)) return []
  return occupancies.filter((o) => isCurrent(o) && o.property_id === propertyId)
}

/** A person's current occupancy, or null if they have none. */
export function currentOccupancyFor (occupancies, personId) {
  if (!Array.isArray(occupancies) || !personId) return null
  return occupancies.find((o) => isCurrent(o) && o.person_id === personId) || null
}

/**
 * The house number to display for a person. Replaces members.house_number /
 * contacts.house_number — the field that had to be re-litigated four times
 * because it existed on two tables at once.
 */
export function houseNumberFor (occupancies, personId, properties) {
  const occ = currentOccupancyFor(occupancies, personId)
  if (!occ) return null
  const prop = (properties || []).find((p) => p.id === occ.property_id)
  return prop ? prop.ref : null
}

/**
 * "The household": everyone who currently shares this person's property,
 * excluding the person themselves. This is what "book for the house" uses.
 * Returns [] for a person with no current occupancy — correct, and notably
 * different from returning everyone, which is what a naive implementation
 * keyed on a null property_id would do.
 */
export function householdOf (occupancies, personId) {
  const occ = currentOccupancyFor(occupancies, personId)
  if (!occ) return []
  return currentOccupants(occupancies, occ.property_id)
    .filter((o) => o.person_id && o.person_id !== personId)
}

/**
 * Full history for a property, newest first. Rows whose person has been purged
 * have person_id = null but still carry person_name_at_time, which is the whole
 * point of the snapshot — the answer to "who lived at #45 in 2025" survives.
 */
export function occupancyHistory (occupancies, propertyId) {
  if (!Array.isArray(occupancies)) return []
  return occupancies
    .filter((o) => o.property_id === propertyId)
    .slice()
    .sort((a, b) => String(b.from_date || '').localeCompare(String(a.from_date || '')))
}

/** Display label for one occupancy row, purge-safe. */
export function occupantLabel (occ) {
  if (!occ) return null
  return occ.person_name_at_time || 'Former resident'
}

/**
 * Derive a property's status from its occupancies. Only ever returns
 * 'occupied' or 'vacant' — 'unbuilt' and 'withheld' are deliberate human
 * statements about a property that no amount of occupancy data can imply, so
 * they are preserved rather than overwritten.
 */
export function derivePropertyStatus (occupancies, property) {
  if (!property) return null
  if (property.status === 'unbuilt' || property.status === 'withheld') return property.status
  return currentOccupants(occupancies, property.id).length > 0 ? 'occupied' : 'vacant'
}

/**
 * Move someone out: close the current occupancy rather than deleting it.
 * Returns the patch for that row, or null if they had no current occupancy.
 */
export function closeOccupancy (occupancies, personId, onDate) {
  const occ = currentOccupancyFor(occupancies, personId)
  if (!occ) return null
  const d = onDate || new Date().toISOString().slice(0, 10)
  // Never end before it began — a backdated move-out earlier than the move-in
  // would otherwise violate the occupancies_dates_sane CHECK in migration 068.
  const to = occ.from_date && d < occ.from_date ? occ.from_date : d
  return { id: occ.id, to_date: to }
}

/** Properties with nobody in them, in display order. */
export function vacantProperties (occupancies, properties) {
  return (properties || [])
    .filter((p) => derivePropertyStatus(occupancies, p) === 'vacant')
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}
