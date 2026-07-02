/**
 * JustWatch (unofficial GraphQL API) streaming-availability lookup.
 *
 * Same data source used by the original Element Movies app. There is no
 * official public API, so we call the same endpoint JustWatch's own website
 * uses, matching on tmdb_id (which every movie in our DB already has) to
 * avoid ambiguity between remakes/re-releases sharing a title.
 *
 * Returns a structured offers object — never throws. On any failure
 * (network, no match, JustWatch downtime) it returns `{ matched: false }`
 * plus empty arrays, so callers can always safely read .flatrate/.rent/.buy.
 */

const JUSTWATCH_ENDPOINT = 'https://apis.justwatch.com/graphql'
const FETCH_TIMEOUT_MS = 8000

const SEARCH_QUERY = `
query GetSearchTitles($country: Country!, $language: Language!, $first: Int!, $filter: TitleFilter) {
  popularTitles(country: $country, first: $first, filter: $filter) {
    edges {
      node {
        id
        objectType
        content(country: $country, language: $language) {
          title
          originalReleaseYear
          externalIds { imdbId tmdbId }
        }
        offers(country: $country, platform: WEB) {
          monetizationType
          package { clearName }
          retailPrice(language: $language)
        }
      }
    }
  }
}
`

function emptyResult(matched = false) {
  return { flatrate: [], rent: [], buy: [], matched }
}

async function justwatchFetch(variables) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(JUSTWATCH_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        // JustWatch's endpoint checks these — without them requests are rejected
        Origin: 'https://www.justwatch.com',
        Referer: 'https://www.justwatch.com/',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({
        operationName: 'GetSearchTitles',
        variables,
        query: SEARCH_QUERY,
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    if (json.errors) return null
    return json.data
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function parsePrice(priceStr) {
  if (!priceStr) return Infinity
  const n = parseFloat(String(priceStr).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : Infinity
}

function cheapestPerService(offers) {
  // offers: [{ service, price }] — some titles list the same service twice
  // (SD/HD presentations). Keep only the cheapest listing per service.
  const bySvc = new Map()
  for (const o of offers) {
    const existing = bySvc.get(o.service)
    if (!existing || parsePrice(o.price) < parsePrice(existing.price)) {
      bySvc.set(o.service, o)
    }
  }
  return [...bySvc.values()]
}

/**
 * Look up a title's AU streaming availability.
 * @param {object} params
 * @param {string} params.title    - movie title (used for the JustWatch search)
 * @param {string|number} params.tmdbId - our tmdb_id, used to disambiguate search results
 * @param {string|number} [params.year] - release year, used as a secondary disambiguator
 * @returns {Promise<{flatrate: string[], rent: {service,price}[], buy: {service,price}[], matched: boolean}>}
 */
export async function fetchStreamingOffers({ title, tmdbId, year }) {
  if (!title) return emptyResult(false)

  const data = await justwatchFetch({
    country: 'AU',
    language: 'en',
    first: 5,
    filter: { searchQuery: title },
  })
  const edges = data?.popularTitles?.edges || []
  if (edges.length === 0) return emptyResult(false)

  // Prefer an exact tmdb_id match — this is the only reliable disambiguator
  // between remakes/re-releases that share a title.
  let node = tmdbId
    ? edges.find(e => e.node?.content?.externalIds?.tmdbId === String(tmdbId))?.node
    : null

  // Fall back to year match if tmdb_id wasn't available or didn't match
  // (e.g. a title JustWatch hasn't linked to TMDB yet).
  if (!node && year) {
    node = edges.find(e => String(e.node?.content?.originalReleaseYear) === String(year))?.node
  }

  // Last resort: take the top search result. Better than nothing, but flag
  // it as unmatched-by-id so a human can sanity-check it if needed.
  if (!node) {
    return emptyResult(false)
  }

  const offers = node.offers || []
  const flatrate = [...new Set(
    offers.filter(o => o.monetizationType === 'FLATRATE').map(o => o.package?.clearName).filter(Boolean)
  )]
  const rent = cheapestPerService(
    offers.filter(o => o.monetizationType === 'RENT')
      .map(o => ({ service: o.package?.clearName, price: o.retailPrice }))
      .filter(o => o.service)
  )
  const buy = cheapestPerService(
    offers.filter(o => o.monetizationType === 'BUY')
      .map(o => ({ service: o.package?.clearName, price: o.retailPrice }))
      .filter(o => o.service)
  )

  return { flatrate, rent, buy, matched: true }
}

export { parsePrice }
