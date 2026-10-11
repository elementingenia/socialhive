// Unit tests for lib/bookLookup.js — Google Books with retry, Open Library
// fallback (BUG-088, 2026-10-11: Ray Dyer's barcode adds failing because
// Google Books was returning 503 on most calls).
//   npm run test:unit

import {
  normaliseIsbn, isValidIsbn, isOpenLibraryId,
  mapGoogleVolume, mapOpenLibraryEdition, mapOpenLibrarySearchDoc, bookRowFields,
  googleBooksGet, lookupByIsbn, openLibraryByTitle,
  queryWords, matchesAllWords, manualBookRow, volumeHasIsbn, googleIsbnSearch,
} from '../../lib/bookLookup.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }
const eq = (a, b, m) => ok(a === b, `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

const origErr = console.error
console.error = () => {}

// ── basics ───────────────────────────────────────────────────────────────────
eq(normaliseIsbn('978-0-14-118535-4'), '9780141185354', 'normalise strips hyphens')
eq(isValidIsbn('9780141185354'), true, '13-digit valid')
eq(isValidIsbn('014118535X'), true, '10-digit with X valid')
eq(isValidIsbn('12345'), false, 'short invalid')
eq(isOpenLibraryId('OL7353617M'), true, 'OL edition id')
eq(isOpenLibraryId('zyTCAlFPjgYC'), false, 'Google id is not OL')

// ── mapping ──────────────────────────────────────────────────────────────────
const gVol = { id: 'g1', volumeInfo: { title: 'Digital Fortress', authors: ['Dan Brown'], publishedDate: '2004-05',
  industryIdentifiers: [{ type: 'ISBN_10', identifier: '0552161253' }, { type: 'ISBN_13', identifier: '9780552161251' }],
  imageLinks: { thumbnail: 'http://x/y.jpg' }, averageRating: 3.5, publisher: 'Corgi' } }
const g = mapGoogleVolume(gVol)
eq(g.source, 'google', 'google source')
eq(g.isbn, '9780552161251', 'google prefers ISBN-13')
eq(g.cover_url, 'https://x/y.jpg', 'google cover https')
eq(g.published_year, 2004, 'google year')
eq(g.rating, '3.5', 'google rating')

const olRec = { title: 'The Shelters of Stone', authors: [{ name: 'Jean M. Auel' }], publish_date: 'May 2003',
  publishers: [{ name: 'Hodder' }], subjects: [{ name: 'Prehistoric peoples' }],
  identifiers: { openlibrary: ['OL3700000M'], isbn_13: ['9780340824801'] }, cover: { medium: 'https://covers/m.jpg' },
  url: 'https://openlibrary.org/books/OL3700000M/x' }
const o = mapOpenLibraryEdition(olRec, '9780340824801')
eq(o.source, 'openlibrary', 'OL source')
eq(o.google_books_id, 'OL3700000M', 'OL key stored as id')
eq(o.author, 'Jean M. Auel', 'OL author')
eq(o.published_year, 2003, 'OL year parsed from free text')
eq(o.publisher, 'Hodder', 'OL publisher')
eq(o.genres, 'Prehistoric peoples', 'OL subjects -> genres')
eq(o.isbn, '9780340824801', 'OL keeps requested ISBN')
eq(mapOpenLibraryEdition({ title: 'x', identifiers: {} }, '1'), null, 'OL record without key rejected')

eq(mapOpenLibrarySearchDoc({ title: 'A', author_name: ['B'], cover_edition_key: 'OL1M' }), null, 'search doc without ISBN dropped')
eq(mapOpenLibrarySearchDoc({ title: 'A', author_name: ['B'], isbn: ['9781234567897'] }), null, 'search doc without edition key dropped')
const sd = mapOpenLibrarySearchDoc({ title: 'A', author_name: ['B'], isbn: ['0123456789', '9781234567897'], cover_edition_key: 'OL1M', cover_i: 5 })
eq(sd.isbn, '9781234567897', 'search doc prefers 978 ISBN-13')
eq(sd.cover_url, 'https://covers.openlibrary.org/b/id/5-M.jpg', 'search doc cover url')

const row = bookRowFields(o)
eq(row.genre, 'Prehistoric peoples', 'row maps genres -> genre')
eq(row.genres, 'Prehistoric peoples', 'row also fills genres column (Book Club reads it)')
eq(row.google_books_id, 'OL3700000M', 'row keeps id')

// ── network behaviour (mocked fetch) ─────────────────────────────────────────
function resp(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body } }
function mockFetch(handlers) {
  const calls = []
  const f = async (url) => { calls.push(url); const h = handlers.find(([m]) => url.includes(m)); return h[1](calls.filter(c => c.includes(h[0])).length) }
  f.calls = calls
  return f
}

// 1. Google 503 twice then OK -> retried, Google result used
{
  const f = mockFetch([['googleapis', n => n < 3 ? resp(503, { error: { message: 'unavailable' } }) : resp(200, { items: [gVol] })]])
  const r = await lookupByIsbn('9780552161251', { fetchImpl: f })
  eq(r.result?.source, 'google', 'retry recovers Google result')
  eq(f.calls.length, 3, 'three Google attempts')
}
// 2. Google 503 every time -> Open Library used
{
  const f = mockFetch([
    ['googleapis', () => resp(503, {})],
    ['openlibrary', () => resp(200, { 'ISBN:9780340824801': olRec })],
  ])
  const r = await lookupByIsbn('9780340824801', { fetchImpl: f })
  eq(r.result?.source, 'openlibrary', 'Google down -> Open Library')
}
// 3. Google OK but empty (the "valid ISBN, no results" case) -> Open Library
{
  const f = mockFetch([
    ['googleapis', () => resp(200, { totalItems: 0 })],
    ['openlibrary', () => resp(200, { 'ISBN:9780340824801': olRec })],
  ])
  const r = await lookupByIsbn('9780340824801', { fetchImpl: f })
  eq(r.result?.google_books_id, 'OL3700000M', 'Google empty -> Open Library')
  eq(f.calls.filter(c => c.includes('googleapis')).length, 2, 'empty isbn: tries the bare number once, no retries (BUG-092)')
}
// 4. Neither has it -> null result, no error
{
  const f = mockFetch([['googleapis', () => resp(200, {})], ['openlibrary', () => resp(200, {})]])
  const r = await lookupByIsbn('9780000000000', { fetchImpl: f })
  eq(r.result, null, 'not found anywhere -> null')
  eq(r.error, undefined, 'not found is not an error')
}
// 5. Both unreachable -> error surfaced
{
  const f = mockFetch([['googleapis', () => resp(503, {})], ['openlibrary', () => resp(500, {})]])
  const r = await lookupByIsbn('9780000000000', { fetchImpl: f })
  eq(r.error, 'search_unavailable', 'both down -> search_unavailable')
}
// 6. Quota (429) not retried
{
  const f = mockFetch([['googleapis', () => resp(429, { error: { status: 'RESOURCE_EXHAUSTED' } })]])
  const r = await googleBooksGet('volumes?q=x', { fetchImpl: f })
  eq(r.error, 'quota_exceeded', '429 -> quota_exceeded')
  eq(f.calls.length, 1, '429 not retried')
}
// 7. Title search fallback filters unusable docs
{
  const f = mockFetch([['openlibrary', () => resp(200, { docs: [
    { title: 'Alpha', author_name: ['Bee'], isbn: ['9781234567897'], cover_edition_key: 'OL1M' },
    { title: 'Alpha no isbn', author_name: ['Bee'], cover_edition_key: 'OL2M' },
  ] })]])
  const r = await openLibraryByTitle('Alpha', { fetchImpl: f })
  eq(r.results.length, 1, 'title fallback keeps only addable docs')
}

// ── BUG-092: title+author words, plain-ISBN retry, manual entry ─────────────
eq(JSON.stringify(queryWords('High Wire  Candice Fox')), '["high","wire","candice","fox"]', 'queryWords splits + lowercases')
eq(JSON.stringify(queryWords('A b')), '[]', 'single letters dropped')
eq(matchesAllWords('High Wire Candice Fox', queryWords('high wire fox')), true, 'title + author words match')
eq(matchesAllWords('Mirette on the high wire Emily Arnold McCully', queryWords('High Wire Candice Fox')), false, 'author words exclude other High Wires')
eq(matchesAllWords('Le Carré', queryWords('le carre')), true, 'accents ignored')
eq(matchesAllWords('anything', []), false, 'no words never matches')
{
  const m = manualBookRow({ title: '  High   Wire ', author: 'Candice Fox', isbn: '978-1-76104-904-0' })
  eq(m.row?.title, 'High Wire', 'manual title tidied')
  eq(m.row?.isbn, '9781761049040', 'manual isbn normalised')
  eq(m.row?.google_books_id, null, 'manual has no external id')
  eq(manualBookRow({ title: 'X' }).error, "Enter the book's title", 'manual needs a title')
  eq(manualBookRow({ title: 'High Wire', isbn: '12345' }).error, 'ISBN must be a full 10 or 13-digit number', 'manual rejects partial isbn')
  eq(manualBookRow({ title: 'High Wire' }).row?.isbn, null, 'manual isbn optional')
}
{
  const hw = { id: 'hw1', volumeInfo: { title: 'High Wire', authors: ['Candice Fox'], industryIdentifiers: [{ type: 'ISBN_13', identifier: '9781761049040' }] } }
  const other = { id: 'o1', volumeInfo: { title: 'Other', authors: ['X'], industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780000000002' }] } }
  eq(volumeHasIsbn(hw, '9781761049040'), true, 'volumeHasIsbn true')
  eq(volumeHasIsbn(other, '9781761049040'), false, 'volumeHasIsbn false')
  const f = mockFetch([['googleapis', () => null]])
  const f2 = async (url) => { f.calls.push(url); return url.includes('isbn:') ? resp(200, { totalItems: 0 }) : resp(200, { items: [other, hw] }) }
  f2.calls = f.calls
  const r = await googleIsbnSearch('9781761049040', { fetchImpl: f2 })
  eq(r.items?.length, 1, 'plain-number retry keeps only the volume listing the ISBN')
  eq(r.items?.[0]?.id, 'hw1', 'plain-number retry finds the High Wire volume')
  const r2 = await lookupByIsbn('9781761049040', { fetchImpl: f2 })
  eq(r2.result?.title, 'High Wire', 'lookupByIsbn uses the plain-number retry')
}

console.error = origErr
console.log(`bookLookup: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
