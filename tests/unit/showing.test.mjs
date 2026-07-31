// Unit tests for lib/showing.js — Movies events that aren't films.
//   npm run test:unit

import {
  isFreeTextShowing, posterFor, posterPosition, titleFor, validateShowing,
  posterAlt, FALLBACK_TITLE
} from '../../lib/showing.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }
const eq = (a, b, m) => ok(a === b, `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

const movie = { title: 'Jerry & Marge Go Large', poster_url: 'https://img/jerry.jpg' }
const filmEvent = { movie_id: 'm1', title: 'Jerry & Marge Go Large' }
const footy = { movie_id: null, title: 'AFL Grand Final', image_url: 'https://img/afl.jpg',
                image_focal_x: 30, image_focal_y: 20 }

// ── which kind of showing ──────────────────────────────────────────────────
ok(!isFreeTextShowing(filmEvent), 'a film is not a free-text showing')
ok(isFreeTextShowing(footy), 'no movie_id => free-text showing')
ok(!isFreeTextShowing(null), 'null event => false, never throws')

// ── poster resolution ──────────────────────────────────────────────────────
eq(posterFor(filmEvent, movie), 'https://img/jerry.jpg', 'film uses the movie poster')
eq(posterFor(footy, null), 'https://img/afl.jpg', 'free text uses the uploaded image')
eq(posterFor({ movie_id: 'm1', movie_snapshot: { poster_url: 'https://img/snap.jpg' } }, null),
   'https://img/snap.jpg', 'falls back to the movie_snapshot when the movie row is gone')
eq(posterFor({ movie_id: null }, null), null, 'nothing to show => null, so the caller draws its placeholder')
eq(posterFor(null, null), null, 'null event => null')
// a movie poster must win even if an image was also uploaded
eq(posterFor({ movie_id: 'm1', image_url: 'https://img/other.jpg' }, movie),
   'https://img/jerry.jpg', 'the movie poster wins over any uploaded image')

// ── focal point ────────────────────────────────────────────────────────────
// A film event that ALSO carries a focal point — the only case that can tell
// "always centre a movie poster" apart from "fall back to 50/50". Without a
// focal point set, both branches return the same string and the test is blind.
// (A mutation test caught exactly that: removing the movie-poster branch
// entirely still passed until this case existed.)
eq(posterPosition({ ...filmEvent, image_focal_x: 10, image_focal_y: 90 }, movie), '50% 50%',
   'a movie poster is authored art — centred even when the event has a focal point')
eq(posterPosition(filmEvent, movie), '50% 50%', 'movie poster with no focal point => centred')
eq(posterPosition(footy, null), '30% 20%', 'an uploaded photo honours its focal point')
eq(posterPosition({ movie_id: null, image_url: 'x' }, null), '50% 50%',
   'uploaded image with no focal point set => centred')
eq(posterPosition({ movie_id: null, image_focal_x: 0, image_focal_y: 0 }, null), '0% 0%',
   'zero is a real focal value, not "unset"')

// ── titles ─────────────────────────────────────────────────────────────────
eq(titleFor({ movieTitle: 'Casablanca' }), 'Casablanca', 'film takes the movie title')
eq(titleFor({ freeText: 'AFL Grand Final' }), 'AFL Grand Final', 'free text is used as typed')
eq(titleFor({ movieTitle: 'Casablanca', freeText: 'ignored' }), 'Casablanca', 'movie title wins')
eq(titleFor({ freeText: '   ' }), FALLBACK_TITLE, 'whitespace-only falls back')
eq(titleFor({}), FALLBACK_TITLE, 'nothing at all falls back')
eq(titleFor({ freeText: '  AFL Grand Final  ' }), 'AFL Grand Final', 'trims the typed title')
eq(FALLBACK_TITLE, 'Movie Night', 'the fallback is unchanged from before this feature')

// ── validation ─────────────────────────────────────────────────────────────
eq(validateShowing({ mode: 'movie', movieId: 'm1' }), null, 'movie mode with a movie is valid')
ok(validateShowing({ mode: 'movie', movieId: null }), 'movie mode with no movie => error')
eq(validateShowing({ mode: 'other', freeText: 'AFL Grand Final' }), null, 'free text is valid')
ok(validateShowing({ mode: 'other', freeText: '' }), 'empty free text => error')
ok(validateShowing({ mode: 'other', freeText: '   ' }), 'whitespace free text => error')
ok(/what is showing/.test(validateShowing({ mode: 'other', freeText: '' })),
   'the error says what to do, not just that it is wrong')
ok(validateShowing({ mode: 'other', freeText: 'x'.repeat(81) }), '81 characters => error')
eq(validateShowing({ mode: 'other', freeText: 'x'.repeat(80) }), null, 'exactly 80 is allowed')

// ── alt text ───────────────────────────────────────────────────────────────
eq(posterAlt(filmEvent, movie), 'Jerry & Marge Go Large', 'alt uses the movie title')
eq(posterAlt(footy, null), 'AFL Grand Final', 'alt uses the event title for free text')
eq(posterAlt({}, null), 'Showing', 'alt is never empty — screen readers need something')

console.log(`showing: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
