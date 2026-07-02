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
 * Determine FREE/COST for a movie and return the single winning reason.
 *
 * When more than one source would make a movie free, only one reason is ever
 * shown — picking whichever tag applies without a hard priority order was
 * producing inconsistent-looking results across movies with more than one
 * source (e.g. one showing "DVD Library" and another showing "Streaming:
 * Binge" despite both also having a personal ownership record). Hardcoded
 * priority, highest wins first match:
 *   1. Owned Digital   — personal ownership_type='digital'
 *   2. Owned Community DVD — the community DVD Library (we_own=true match)
 *   3. Owned private DVD   — personal ownership_type='dvd'
 *   4. Streaming service  — matches one of the club's subscribed services
 *
 * @param {object} movie           - movie record (needs: id, tmdb_id, imdb_id, streaming_offers)
 * @param {object} opts
 * @param {string[]} opts.streamingServices  - community's subscribed service names
 * @param {Set<string>} opts.dvdTmdbIds      - tmdb_ids of DVD Library titles
 * @param {Set<string>} opts.dvdImdbIds      - imdb_ids of DVD Library titles
 * @param {Array}  opts.ownershipRecords     - [{ movie_id, ownership_type, member_name }] — admin only
 *
 * @returns {{ isFree: boolean, reasons: string[] }}
 *   reasons is always a single-item array: the one winning free reason (by
 *   priority order above) when isFree is true, or the best available paid
 *   option (rent price, "not available in AU", "not checked yet") when false.
 */
export function computeFreeCost(movie, {
  streamingServices = [],
  dvdTmdbIds        = new Set(),
  dvdImdbIds        = new Set(),
  ownershipRecords  = [],
} = {}) {
  const owned = ownershipRecords.filter(o => o.movie_id === movie.id)

  // 1. Owned Digital — highest priority
  const digital = owned.find(o => o.ownership_type === 'digital')
  if (digital) {
    return { isFree: true, reasons: [digital.member_name ? `Personal Digital: ${digital.member_name}` : 'Personal Digital'] }
  }

  // 2. Owned Community DVD — the shared DVD Library (matched by tmdb_id/imdb_id)
  const inDvdLibrary =
    (movie.tmdb_id && dvdTmdbIds.has(String(movie.tmdb_id))) ||
    (movie.imdb_id && dvdImdbIds.has(String(movie.imdb_id)))
  if (inDvdLibrary) {
    return { isFree: true, reasons: ['DVD Library'] }
  }

  // 3. Owned private DVD — a resident's own physical copy
  const dvd = owned.find(o => o.ownership_type === 'dvd')
  if (dvd) {
    return { isFree: true, reasons: [dvd.member_name ? `Personal DVD: ${dvd.member_name}` : 'Personal DVD'] }
  }

  // 4. Streaming match — flatrate (subscription) services only, lowest priority
  const offers = movie.streaming_offers || null
  const ourNorm = streamingServices.map(normaliseService)
  const flatrate = offers?.flatrate || []
  for (const svc of flatrate) {
    const norm = normaliseService(svc)
    if (ourNorm.some(o => o === norm || o.includes(norm) || norm.includes(o))) {
      const matched = streamingServices.find(o => {
        const on = normaliseService(o)
        return on === norm || on.includes(norm) || norm.includes(on)
      })
      return { isFree: true, reasons: [`Streaming: ${matched || svc}`] }
    }
  }

  // Not free — surface the best paid option, so the pill isn't a dead end
  const rent = cheapestOffer(offers?.rent)
  const buy = cheapestOffer(offers?.buy)
  if (rent) return { isFree: false, reasons: [`Rent ${rent.price} · ${rent.service}`] }
  if (buy) return { isFree: false, reasons: [`Buy ${buy.price} · ${buy.service}`] }
  if (offers?.matched === false) return { isFree: false, reasons: ['Not available to stream in AU'] }
  if (!offers) return { isFree: false, reasons: ['Streaming not checked yet'] }
  return { isFree: false, reasons: [] }
}
