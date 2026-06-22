/**
 * Normalise a streaming service name for fuzzy matching.
 * Strips spaces, punctuation, case — "Disney Plus", "Disney+" and "disney+" all become "disneyplus"
 */
export function normaliseService(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '').replace('plus', 'plus')
}

/**
 * Extract streaming service names from a streaming_au string.
 * "Stream: Netflix, Stan, Disney+" → ['Netflix', 'Stan', 'Disney+']
 * "Rent/Buy: A$ 4.99" → []
 * "Not available AU" → []
 */
export function extractStreamingServices(streamingAu) {
  if (!streamingAu) return []
  const s = streamingAu.trim()
  if (/^(rent|buy|not available)/i.test(s)) return []
  // Strip "Stream: " prefix
  const stripped = s.replace(/^Stream:\s*/i, '')
  return stripped.split(',').map(x => x.trim()).filter(Boolean)
}

/**
 * Determine FREE/COST for a movie and return reasons.
 *
 * @param {object} movie           - movie record (needs: id, tmdb_id, imdb_id, streaming_au)
 * @param {object} opts
 * @param {string[]} opts.streamingServices  - community's subscribed service names
 * @param {Set<string>} opts.dvdTmdbIds      - tmdb_ids of DVD Library titles
 * @param {Set<string>} opts.dvdImdbIds      - imdb_ids of DVD Library titles
 * @param {Array}  opts.ownershipRecords     - [{ movie_id, ownership_type, member_name }] — admin only
 *
 * @returns {{ isFree: boolean, reasons: string[] }}
 *   reasons is populated for admin view; for community view just check isFree
 */
export function computeFreeCost(movie, {
  streamingServices = [],
  dvdTmdbIds        = new Set(),
  dvdImdbIds        = new Set(),
  ownershipRecords  = [],
} = {}) {
  const reasons = []
  const ourNorm = streamingServices.map(normaliseService)

  // 1. Streaming match
  const movieServices = extractStreamingServices(movie.streaming_au)
  for (const svc of movieServices) {
    const norm = normaliseService(svc)
    if (ourNorm.some(o => o === norm || o.includes(norm) || norm.includes(o))) {
      // Find the original service name for display
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

  return { isFree: reasons.length > 0, reasons }
}
