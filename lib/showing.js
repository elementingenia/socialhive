// lib/showing.js — what a Movies event is SHOWING.
//
// Iain, 2026-07-31: "Movies needs a free text option if not selecting a movie,
// and there must be a poster image that behaves the same as the movies poster
// currently does when movie image is used. Using Movies to book showing a
// football game, secures the space by default."
//
// So a Movies event is no longer necessarily a film. It is a SHOWING, and a
// film is one kind — the AFL Grand Final is another. Booking it through Movies
// is what secures the Cinema, because every Movies event carries a location_id
// (migrations 071/073), so the space-clash check applies unchanged.
//
// Two shapes, one card:
//   * movie      — movie_id set; title and poster come from the movie
//   * free text  — no movie_id; title typed by the coordinator, poster uploaded
//                  to events.image_url (the same column and uploader Social and
//                  Clubs already use, focal point included)
//
// Pure functions. No I/O.

export const FALLBACK_TITLE = 'Movie Night'

/** Is this a free-text showing rather than a film? */
export function isFreeTextShowing (event) {
  return !!event && !event.movie_id
}

/**
 * The poster for a screening card. A movie's poster wins; otherwise the
 * uploaded image. Returns null when there is neither, so the caller renders its
 * placeholder rather than an empty <img>.
 *
 * `movie` is the joined movies row (or the movie_snapshot for a deleted movie).
 */
export function posterFor (event, movie) {
  return movie?.poster_url || event?.movie_snapshot?.poster_url || event?.image_url || null
}

/**
 * Focal point for the poster, as a CSS object-position.
 *
 * A movie poster is authored art — it is never focal-point cropped, and
 * centring it is correct. An uploaded photo of a football match is not, so it
 * honours the focal point the coordinator set, exactly as Social and Clubs do.
 */
export function posterPosition (event, movie) {
  const usingMoviePoster = !!(movie?.poster_url || event?.movie_snapshot?.poster_url)
  if (usingMoviePoster) return '50% 50%'
  const x = Number.isFinite(event?.image_focal_x) ? event.image_focal_x : 50
  const y = Number.isFinite(event?.image_focal_y) ? event.image_focal_y : 50
  return `${x}% ${y}%`
}

/**
 * The title to store on the event.
 *
 * A film takes the movie's title. A free-text showing takes what was typed.
 * Neither may be blank — an untitled card is useless on the Scheduled list —
 * so it falls back to the same default screenings have always used.
 */
export function titleFor ({ movieTitle, freeText } = {}) {
  const m = (movieTitle || '').trim()
  if (m) return m
  const f = (freeText || '').trim()
  return f || FALLBACK_TITLE
}

/**
 * Validation for the screening form. Returns an error string, or null.
 * A free-text showing must actually say what is showing — otherwise every card
 * reads "Movie Night" and nobody knows what they booked.
 */
export function validateShowing ({ mode, movieId, freeText } = {}) {
  if (mode === 'movie') return movieId ? null : 'Choose a movie'
  if (!(freeText || '').trim()) return 'Say what is showing, e.g. AFL Grand Final'
  if ((freeText || '').trim().length > 80) return 'Keep it under 80 characters'
  return null
}

/** Alt text for the poster image — never the empty string, for screen readers. */
export function posterAlt (event, movie) {
  return movie?.title || event?.movie_snapshot?.title || event?.title || 'Showing'
}
