// Shared book lookup -- Google Books first, Open Library as the fallback.
//
// Why this exists (BUG-088, 2026-10-11): Ray Dyer reported that adding books
// by barcode (camera scan AND typed ISBN) had stopped working. Confirmed live:
// Google Books was answering our server with "503 Service temporarily
// unavailable" on 13 of 15 calls, and on some of the calls that did succeed it
// returned zero results for ISBNs it definitely has (The Fleet at Flood Tide,
// already in the Library with a Google ID). BUG-031 had measured ~40% failure
// in August; it is now most calls. Nothing we can fix on Google's side, so:
//   1. retry Google a few times (its 503s come back in ~100ms, so this is cheap)
//   2. if Google still fails -- or finds nothing for an ISBN -- ask Open Library
//      (free, no key, no daily cap; found 15 of 20 sample ISBNs from our own
//      shelves when tested).
//
// Open Library results are stored with their edition key (e.g. "OL7353617M")
// in books.google_books_id. That column already held Open Library IDs before
// the move to Google Books (see app/api/books/details/route.js's "Legacy Open
// Library ID" branch), so nothing new in the schema -- and an id starting with
// "OL" is how every caller tells the two sources apart.
//
// Everything below the "pure mapping" line has no network or DB access, so it
// is unit-tested directly (tests/unit/bookLookup.test.mjs).

export function normaliseIsbn(raw) {
  return (raw || "").toUpperCase().replace(/[^0-9X]/g, "")
}

export function isValidIsbn(isbn) {
  return /^(\d{9}[\dX]|\d{13})$/.test(isbn || "")
}

export function isOpenLibraryId(id) {
  return typeof id === "string" && /^OL\d+[MW]$/.test(id)
}

// ── pure mapping ─────────────────────────────────────────────────────────────

function yearFrom(str) {
  const m = String(str || "").match(/\b(1[5-9]\d\d|20\d\d)\b/)
  return m ? parseInt(m[1], 10) : null
}

function pickIsbn13(list) {
  const clean = (list || []).map(normaliseIsbn).filter(isValidIsbn)
  return clean.find(x => x.length === 13 && /^97[89]/.test(x)) || clean.find(x => x.length === 13) || clean[0] || null
}

// Google Books volume -> our result shape (same fields /api/books/search has
// always returned, plus `source`).
export function mapGoogleVolume(item) {
  const info = item?.volumeInfo || {}
  const ids = info.industryIdentifiers || []
  const isbn = (ids.find(x => x.type === "ISBN_13") || ids.find(x => x.type === "ISBN_10"))?.identifier || null
  return {
    source:         "google",
    google_books_id: item.id,
    title:          info.title,
    author:         (info.authors || []).slice(0, 2).join(", "),
    cover_url:      info.imageLinks?.thumbnail?.replace("http://", "https://") || null,
    summary:        info.description || null,
    rating:         info.averageRating ? parseFloat(info.averageRating).toFixed(1) : null,
    rating_link:    info.infoLink || `https://books.google.com/books?id=${item.id}`,
    genres:         (info.categories || []).slice(0, 4).join(", ") || null,
    published_year: info.publishedDate ? (parseInt(info.publishedDate.substring(0, 4), 10) || null) : null,
    isbn,
    publisher:      info.publisher || null,
  }
}

// Open Library /api/books?jscmd=data record -> our result shape.
// `requestedIsbn` is the barcode that was looked up; it wins over whatever the
// record lists, since it is the exact printed copy in the resident's hand.
export function mapOpenLibraryEdition(rec, requestedIsbn) {
  if (!rec?.title) return null
  const key = (rec.identifiers?.openlibrary || [])[0] || (rec.key || "").split("/").pop() || null
  if (!isOpenLibraryId(key)) return null
  const isbn = requestedIsbn || pickIsbn13([...(rec.identifiers?.isbn_13 || []), ...(rec.identifiers?.isbn_10 || [])])
  const title = rec.subtitle ? `${rec.title}: ${rec.subtitle}` : rec.title
  return {
    source:         "openlibrary",
    google_books_id: key,
    title,
    author:         (rec.authors || []).map(a => a.name).filter(Boolean).slice(0, 2).join(", "),
    cover_url:      rec.cover?.medium || rec.cover?.large || null,
    summary:        null,
    rating:         null,
    rating_link:    rec.url || `https://openlibrary.org/books/${key}`,
    genres:         (rec.subjects || []).map(s => s.name).filter(Boolean).slice(0, 4).join(", ") || null,
    published_year: yearFrom(rec.publish_date),
    isbn,
    publisher:      (rec.publishers || [])[0]?.name || null,
  }
}

// Open Library search.json doc -> our result shape. Only docs with an ISBN are
// usable: Add to Library re-fetches by ISBN, so a doc without one can't be
// added and is dropped.
export function mapOpenLibrarySearchDoc(doc) {
  if (!doc?.title || !doc.author_name?.length) return null
  const isbn = pickIsbn13(doc.isbn)
  if (!isbn) return null
  const key = doc.cover_edition_key || (doc.edition_key || [])[0] || null
  if (!isOpenLibraryId(key)) return null
  return {
    source:         "openlibrary",
    google_books_id: key,
    title:          doc.title,
    author:         doc.author_name.slice(0, 2).join(", "),
    cover_url:      doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
    summary:        null,
    rating:         null,
    rating_link:    doc.key ? `https://openlibrary.org${doc.key}` : null,
    genres:         (doc.subject || []).slice(0, 4).join(", ") || null,
    published_year: doc.first_publish_year || null,
    isbn,
    publisher:      (doc.publisher || [])[0] || null,
  }
}

// Title search words (BUG-092, 2026-10-11). A resident types "High Wire" or
// "High Wire Candice Fox"; we match on every word of 2+ characters appearing
// somewhere in the result's title, subtitle or authors, so adding the author
// narrows the list instead of emptying it (the old intitle: search needed the
// whole typed string inside the title, so "title + author" never matched).
export function queryWords(q) {
  return (q || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9']+/).filter(w => w.length >= 2)
}

export function matchesAllWords(text, words) {
  const hay = (text || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  return words.length > 0 && words.every(w => hay.includes(w))
}

// A manually-entered book (nothing found anywhere). Title is required,
// author and ISBN optional; returns { row } or { error }.
export function manualBookRow({ title, author, isbn } = {}) {
  const t = (title || "").trim().replace(/\s+/g, " ")
  if (t.length < 2) return { error: "Enter the book's title" }
  const cleanIsbn = normaliseIsbn(isbn)
  if (cleanIsbn && !isValidIsbn(cleanIsbn)) return { error: "ISBN must be a full 10 or 13-digit number" }
  return { row: {
    google_books_id: null,
    title:  t,
    author: (author || "").trim().replace(/\s+/g, " ") || null,
    isbn:   cleanIsbn || null,
    notes:  "Added manually - not found on Google Books or Open Library",
  } }
}

// Fields a books row takes from a lookup result (genres -> genre column).
export function bookRowFields(r) {
  return {
    google_books_id: r.google_books_id,
    title:          r.title,
    author:         r.author || null,
    cover_url:      r.cover_url || null,
    summary:        r.summary || null,
    rating:         r.rating || null,
    rating_link:    r.rating_link || null,
    // books has two genre columns (BUG-091): the Library page reads `genre`,
    // Book Club (EventSlideOut, BookCatalogue) reads `genres`. Write both.
    genre:          r.genres || null,
    genres:         r.genres || null,
    published_year: r.published_year || null,
    isbn:           r.isbn || null,
    publisher:      r.publisher || null,
  }
}

// ── network ──────────────────────────────────────────────────────────────────

const OL_HEADERS = { "User-Agent": "ElementHappenings/1.0 (element.ingenia@gmail.com)" }

async function timedFetch(url, ms, opts = {}, fetchImpl = fetch) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), ms)
  try {
    return await fetchImpl(url, { ...opts, signal: controller.signal, cache: "no-store" })
  } finally {
    clearTimeout(t)
  }
}

// Google with retry. Returns { ok:true, data } or { ok:false, error } where
// error is "quota_exceeded" | "search_unavailable" | "not_found".
// 429 (quota) is not retried -- it won't clear in a second.
// BUG-093 (2026-10-11 evening): Google was 503-ing most search calls (one
// query failed 10 times in a row), so 3 attempts often wasn't enough. 503s
// come back in ~100ms; 5 attempts inside an 8s budget.
export async function googleBooksGet(path, { fetchImpl = fetch, attempts = 5, budgetMs = 8000 } = {}) {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY
  const sep = path.includes("?") ? "&" : "?"
  const url = `https://www.googleapis.com/books/v1/${path}${apiKey ? `${sep}key=${apiKey}` : ""}`
  const started = Date.now()
  let lastError = "search_unavailable"
  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      if (Date.now() - started > budgetMs) break
      await new Promise(r => setTimeout(r, 200 * i))
    }
    try {
      const res = await timedFetch(url, 5000, {}, fetchImpl)
      if (res.ok) return { ok: true, data: await res.json() }
      const body = await res.json().catch(() => ({}))
      console.error("Google Books error:", res.status, body?.error?.message, `(attempt ${i + 1})`)
      if (res.status === 429 || body?.error?.status === "RESOURCE_EXHAUSTED") return { ok: false, error: "quota_exceeded" }
      if (res.status === 404) return { ok: false, error: "not_found" }
      lastError = "search_unavailable"
    } catch (err) {
      console.error("Google Books fetch failed:", err?.message, `(attempt ${i + 1})`)
      lastError = "search_unavailable"
    }
  }
  return { ok: false, error: lastError }
}

export async function openLibraryByIsbn(isbn, { fetchImpl = fetch } = {}) {
  try {
    const res = await timedFetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
      6000, { headers: OL_HEADERS }, fetchImpl
    )
    if (!res.ok) { console.error("Open Library ISBN error:", res.status); return { ok: false } }
    const data = await res.json()
    const rec = Object.values(data || {})[0]
    return { ok: true, result: rec ? mapOpenLibraryEdition(rec, isbn) : null }
  } catch (err) {
    console.error("Open Library ISBN fetch failed:", err?.message)
    return { ok: false }
  }
}

export async function openLibraryByTitle(q, { fetchImpl = fetch } = {}) {
  try {
    const fields = "key,title,author_name,cover_i,first_publish_year,isbn,subject,cover_edition_key,edition_key,publisher"
    // q= (not title=) so "title author" works; results are then held to every
    // typed word appearing in title/author (BUG-092).
    const words = queryWords(q)
    const res = await timedFetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=30&fields=${fields}`,
      6000, { headers: OL_HEADERS }, fetchImpl
    )
    if (!res.ok) { console.error("Open Library search error:", res.status); return { ok: false } }
    const data = await res.json()
    const docs = (data.docs || []).filter(d => !words.length || matchesAllWords(`${d.title || ""} ${(d.author_name || []).join(" ")}`, words))
    return { ok: true, results: docs.map(mapOpenLibrarySearchDoc).filter(Boolean) }
  } catch (err) {
    console.error("Open Library search fetch failed:", err?.message)
    return { ok: false }
  }
}

// Does this Google volume list the given ISBN (either form)?
export function volumeHasIsbn(item, isbn) {
  const ids = (item?.volumeInfo?.industryIdentifiers || []).map(x => normaliseIsbn(x.identifier))
  return ids.includes(normaliseIsbn(isbn))
}

// Google Books' own ISBN page (books.google.com/books?vid=ISBN...) resolves
// barcodes its search index doesn't (BUG-093: High Wire, 9781761049040 --
// isbn: and bare-number searches both return 0, the page's canonical link is
// the volume). Pure parse of that page's canonical/og:url volume id.
export function volumeIdFromIsbnPage(html) {
  const m = String(html || "").match(/<link[^>]+rel="canonical"[^>]+href="[^"]*[?&]id=([A-Za-z0-9_-]{12})/)
    || String(html || "").match(/og:url"[^>]+content="[^"]*[?&]id=([A-Za-z0-9_-]{12})/)
  return m ? m[1] : null
}

// ISBN page -> volume, accepted only if the volume itself lists that ISBN
// (for an unknown ISBN the page shows an unrelated book).
export async function googleIsbnPage(isbn, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch
  try {
    const res = await timedFetch(`https://books.google.com/books?vid=ISBN${isbn}`, 5000,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; ElementHappenings/1.0)" } }, fetchImpl)
    if (!res.ok) return null
    const id = volumeIdFromIsbnPage(await res.text())
    if (!id) return null
    const g = await googleBooksGet(`volumes/${id}`, opts)
    if (!g.ok || !g.data?.volumeInfo?.title || !volumeHasIsbn(g.data, isbn)) return null
    return g.data
  } catch (err) {
    console.error("Google Books ISBN page failed:", err?.message)
    return null
  }
}

// Google ISBN search. Google's isbn: index misses some editions it actually
// holds (BUG-092: High Wire, Candice Fox, 9781761049040 -- the volume page
// lists that ISBN, an isbn: search returns nothing), so when isbn: is empty we
// try the bare number once as free text and keep only volumes that really
// list it. Returns { ok:true, items } or { ok:false, error }.
export async function googleIsbnSearch(isbn, opts = {}) {
  const g = await googleBooksGet(`volumes?q=isbn:${isbn}&maxResults=5&printType=books`, opts)
  if (g.ok) {
    const items = (g.data.items || []).filter(it => it?.volumeInfo?.title)
    if (items.length) return { ok: true, items }
    const g2 = await googleBooksGet(`volumes?q=${isbn}&maxResults=10&printType=books`, opts)
    const items2 = g2.ok ? (g2.data.items || []).filter(it => it?.volumeInfo?.title && volumeHasIsbn(it, isbn)) : []
    if (items2.length) return { ok: true, items: items2 }
  }
  if (!g.ok && g.error === "quota_exceeded") return g
  // Search empty or unreachable -- Google's own ISBN page (BUG-093). Volume
  // gets have been far more reliable than searches during the 503 spells.
  const page = await googleIsbnPage(isbn, opts)
  if (page) return { ok: true, items: [page] }
  return g.ok ? { ok: true, items: [] } : g
}

// One ISBN -> one best result, Google first then Open Library.
// Returns { result } (may be null = genuinely not found anywhere) or
// { error } when neither source could be reached.
export async function lookupByIsbn(isbn, opts = {}) {
  const g = await googleIsbnSearch(isbn, opts)
  if (g.ok) {
    const item = g.items.find(it => it?.volumeInfo?.title)
    if (item) return { result: mapGoogleVolume(item) }
  }
  const ol = await openLibraryByIsbn(isbn, opts)
  if (ol.ok && ol.result) return { result: ol.result }
  if (!g.ok && !ol.ok) return { error: g.error }
  return { result: null }
}
