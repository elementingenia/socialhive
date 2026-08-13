import { NextResponse } from "next/server"

// Strips anything but digits/X so "978-0-14-118535-4" and "978 0 14 118535 4"
// both match cleanly -- Iain, 2026-08-13: manual barcode entry, the user
// types whatever's printed under the barcode (hyphens and all).
function normaliseIsbn(raw) {
  return (raw || "").toUpperCase().replace(/[^0-9X]/g, "")
}

function extractIsbn(info) {
  const ids = info.industryIdentifiers || []
  const isbn13 = ids.find(x => x.type === "ISBN_13")
  const isbn10 = ids.find(x => x.type === "ISBN_10")
  return (isbn13 || isbn10)?.identifier || null
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const q    = searchParams.get("q")?.trim()
  const isbn = normaliseIsbn(searchParams.get("isbn"))

  // Barcode/ISBN mode -- Iain, 2026-08-13: manual entry only for now (no
  // camera scanning), triggered by an explicit "Search" button rather than
  // live search-as-you-type, and the number must be entered in full: a
  // bare 10 or 13 digit ISBN (10-digit may end in an X check digit).
  if (isbn) {
    if (!/^(\d{9}[\dX]|\d{13})$/.test(isbn)) {
      return NextResponse.json({ results: [], error: "invalid_isbn" }, { status: 400 })
    }
    return searchGoogleBooks(`isbn:${isbn}`, { rerank: false })
  }

  if (!q || q.length < 2) return NextResponse.json({ results: [] })
  return searchGoogleBooks(`intitle:${encodeURIComponent(q)}`, { rerank: true, qNorm: q.toLowerCase().trim() })
}

async function searchGoogleBooks(queryFragment, { rerank, qNorm }) {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY
  const keyParam = apiKey ? `&key=${apiKey}` : ""
  const url = `https://www.googleapis.com/books/v1/volumes?q=${queryFragment}&maxResults=20&printType=books&langRestrict=en${keyParam}`

  let res
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    res = await fetch(url, { signal: controller.signal, cache: "no-store" })
    clearTimeout(timeout)
  } catch (err) {
    console.error("Google Books fetch failed:", err?.message)
    return NextResponse.json({ results: [], error: "search_unavailable" }, { status: 503 })
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    const isQuota = errBody?.error?.status === "RESOURCE_EXHAUSTED" || res.status === 429
    console.error("Google Books error:", res.status, errBody?.error?.message)
    return NextResponse.json(
      { results: [], error: isQuota ? "quota_exceeded" : "search_unavailable" },
      { status: res.status === 429 ? 429 : 503 }
    )
  }

  const data = await res.json()
  const seen = new Set()

  const items = (data.items || []).filter(item => {
    const info = item.volumeInfo
    if (!info?.title || !info?.authors?.length) return false
    if (!rerank) return true // ISBN search -- Google already matched the exact edition, no title-substring gate needed
    const mainTitle = info.title.toLowerCase().split(/[:\-–]/)[0].trim()
    return mainTitle.includes(qNorm)
  })

  const deduped = items.filter(item => {
    const info = item.volumeInfo
    const key = `${info.title.toLowerCase().trim()}|||${(info.authors[0] || "").toLowerCase().trim()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Google's Volumes API (q=intitle:) is a plain relevance search, not the
  // curated ranking google.com/search?tbm=bks shows -- Iain flagged this
  // 2026-08-13: it was putting a mangled-encoding edition first and a
  // "(Book Analysis)" study-aid ahead of the actual novel, matching a
  // gap we already fixed the same way on the Movies side (TMDB's own
  // /search/movie ranks well on its own, so no scoring was needed there --
  // Books needs its own since Google Books' plain relevance order doesn't).
  // Cheap heuristic re-rank rather than trying to replicate Google's real
  // search ranking signals we don't have access to: prefer editions with a
  // real cover image and published rating data (the two things that make
  // an edition look "real" and clickable in the Add Book picker), and push
  // down study guides/companions/summaries and anything with visibly
  // corrupted text (a literal U+FFFD replacement character in the
  // author/title -- bad source data on Google's end, not ours, but no
  // reason to show it above a clean edition of the same book).
  // Not applied to ISBN search: a barcode identifies one specific printed
  // edition, so there's nothing to rank -- Google's own match is the answer.
  const STUDY_AID_RE = /\b(book analysis|study guide|summary|summaries|sparknotes|cliffs?notes|companion|workbook|study notes)\b/i
  function scoreItem(info) {
    let score = 0
    if (info.imageLinks?.thumbnail) score += 3
    // Weighted by the actual rating value, not just whether one exists --
    // Iain, 2026-08-13: a 5.0 edition should clearly outrank a 1.0 edition
    // of the same book, not just tie with it for both having "a" rating.
    // *1.5 puts the full 0-5 scale at 0-7.5, comfortably wider than the
    // structural signals below so rating quality is the dominant factor
    // among same-title results, matching what actually flipped the order
    // wrong in the Harry Potter screenshot (25th Anniversary Edition, 1.0,
    // was outranking the Slytherin Edition, 5.0).
    if (typeof info.averageRating === "number") score += info.averageRating * 1.5
    // Small additional nudge for having a real sample size behind that
    // rating -- log-scaled and capped so one lone 5-star vote doesn't beat
    // a 4.5 backed by hundreds of ratings, but a completely unrated edition
    // still ranks below both.
    if ((info.ratingsCount || 0) > 0) score += Math.min(Math.log10(info.ratingsCount + 1), 1.5)
    if ((info.pageCount || 0) > 80) score += 1
    const text = `${info.title || ""} ${info.subtitle || ""}`
    if (STUDY_AID_RE.test(text)) score -= 5
    const authorText = (info.authors || []).join(" ")
    if (/�/.test(authorText) || /�/.test(info.title || "")) score -= 5
    return score
  }

  const ordered = rerank
    ? deduped
        .map((item, i) => ({ item, score: scoreItem(item.volumeInfo), i }))
        .sort((a, b) => (b.score - a.score) || (a.i - b.i))
        .map(x => x.item)
    : deduped

  const results = ordered.slice(0, 8).map(item => {
    const info = item.volumeInfo
    const cover = info.imageLinks?.thumbnail?.replace("http://", "https://") || null
    const publishedYear = info.publishedDate
      ? parseInt(info.publishedDate.substring(0, 4), 10) || null
      : null
    return {
      google_books_id: item.id,
      title:          info.title,
      author:         (info.authors || []).slice(0, 2).join(", "),
      cover_url:      cover,
      summary:        info.description || null,
      rating:         info.averageRating ? parseFloat(info.averageRating).toFixed(1) : null,
      rating_link:    info.infoLink || `https://books.google.com/books?id=${item.id}`,
      genres:         (info.categories || []).slice(0, 4).join(", ") || null,
      published_year: publishedYear,
      isbn:           extractIsbn(info),
    }
  })

  return NextResponse.json({ results })
}
