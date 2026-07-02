/**
 * Normalise a streaming service name for fuzzy matching.
 * Strips spaces, punctuation, case — "Disney Plus", "Disney+" and "disney+" all become "disneyplus"
 */
export function normaliseService(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '').replace('plus', 'plus')
}

/**
 * Legacy helper — kept for backward compatibility. streaming_au (the plain-text
 * field this parsed) is no longer written by the app; streaming_offers (jsonb,
 * see movies migration 027) is now the source of truth. Nothing currently calls
 * this, but it's harmless to keep around in case any historical data needs it.
 */
export function extractStreamingServices(streamingAu) {
  if (!streamingAu) return []
  const s = streamingAu.trim()
  if (/^(rent|buy|not available)/i.test(s)) return []
  const stripped = s.replace(/^Stream:\s*/i, '')
  return stripped.split(',').map(x => x.trim()).filter(Boolean)
}

function cheapestOffer(offers = []) {
  if (!offers.length) return null
  return offers.reduce((best, o) => {
    const price = parseFloat(String(o.price || '').replace(/[^0-9.]/g, ''))
    const bestPrice = parseFloat(String(best.price || '').replace(/[^0-9.]/g, ''))
    return (Number.isFinite(price) && price < bestPrice) ? o : best
  }, offers[0])
}

/**
 * Determine FREE/COST for a movie and return reasons.
 *
 * @param {object} movie           - movie record (needs: id, tmdb_id, imdb_id, streaming_offers)
 * @param {object} opts
 * @param {string[]} opts.streamingServices  - community's subscribed service names
 * @param {Set<string>} opts.dvdTmdbIds      - tmdb_ids of DVD Library titles
 * @param {Set<string>} opts.dvdImdbIds      - imdb_ids of DVD Library titles
 * @param {Array}  opts.ownershipRecords     - [{ movie_id, ownership_type, member_name }] — admin only
 *
 * @returns {{ isFree: boolean, reasons: string[] }}
 *   When isFree is true, reasons lists what makes it free (streaming service,
 *   DVD Library, personal ownership). When isFree is false, reasons instead
 *   surfaces what paid options exist (e.g. "Rent A$ 4.99 · Apple TV Store"),
 *   or flags that streaming hasn't been checked / isn't available in AU at all.
 */
export function computeFreeCost(movie, {
  streamingServices = [],
  dvdTmdbIds        = new Set(),
  dvdImdbIds        = new Set(),
  ownershipRecords  = [],
} = {}) {
  const reasons = []
  const ourNorm = streamingServices.map(normaliseService)
  const offers = movie.streaming_offers || null

  // 1. Streaming match — flatrate (subscription) services only
  const flatrate = offers?.flatrate || []
  for (const svc of flatrate) {
    const norm = normaliseService(svc)
    if (ourNorm.some(o => o === norm || o.includes(norm) || norm.includes(o))) {
      const matched = streamingServices.find(o => {
        const on = normaliseService(o)
        return on === norm || on.includes(norm) || norm.includes(on)
      })
      reasons.push(`Streaming: ${matched || svc}`)
      break // one streaming reason is enough
    }
  }

  // 2. DVD Library match (by tmdb_id or imdb_id)
  const inDvdLibrary =
    (movie.tmdb_id && dvdTmdbIds.has(String(movie.tmdb_id))) ||
    (movie.imdb_id && dvdImdbIds.has(String(movie.imdb_id)))
  if (inDvdLibrary) reasons.push('DVD Library')

  // 3. Private ownership records for this movie
  const owned = ownershipRecords.filter(o => o.movie_id === movie.id)
  for (const o of owned) {
    const typeLabel = o.ownership_type === 'dvd' ? 'Personal DVD' : 'Personal Digital'
    reasons.push(o.member_name ? `${typeLabel}: ${o.member_name}` : typeLabel)
  }

  const isFree = reasons.length > 0

  // 4. Not free — surface what paid options exist, so the pill isn't a dead end
  if (!isFree) {
    const rent = cheapestOffer(offers?.rent)
    const buy = cheapestOffer(offers?.buy)
    if (rent) {
      reasons.push(`Rent ${rent.price} · ${rent.service}`)
    } else if (buy) {
      reasons.push(`Buy ${buy.price} · ${buy.service}`)
    } else if (offers?.matched === false) {
      reasons.push('Not available to stream in AU')
    } else if (!offers) {
      reasons.push('Streaming not checked yet')
    }
  }

  return { isFree, reasons }
}
