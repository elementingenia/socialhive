import { NextResponse } from "next/server"

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(q)}&limit=40&sort=edition_count&fields=key,title,author_name,cover_i,subject,first_publish_year,edition_count`

  let res
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    res = await fetch(url, { signal: controller.signal, cache: "no-store" })
    clearTimeout(timeout)
  } catch (err) {
    console.error("Open Library fetch failed:", err?.message)
    return NextResponse.json({ results: [], error: "search_unavailable" }, { status: 503 })
  }
  if (!res.ok) return NextResponse.json({ results: [], error: "search_unavailable" }, { status: 503 })

  const data = await res.json()
  const qNorm = q.toLowerCase().trim()
  const seen  = new Set()

  const docs = (data.docs || []).filter(d => d.title && d.author_name?.length)

  // Title relevance: query must appear in main title (before colon/dash)
  // This kills "Implementation: how great expectations…" etc.
  const relevant = docs.filter(d => {
    const mainTitle = d.title.toLowerCase().split(/[:\-–]/)[0].trim()
    return mainTitle.includes(qNorm)
  })

  // Deduplicate by normalised title + first author
  const deduped = relevant.filter(d => {
    const key = `${d.title.toLowerCase().trim()}|||${(d.author_name[0] || "").toLowerCase().trim()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Prefer results with covers, but don't require them
  const withCover    = deduped.filter(d => !!d.cover_i)
  const withoutCover = deduped.filter(d => !d.cover_i)
  const ordered      = [...withCover, ...withoutCover].slice(0, 8)

  const results = ordered.map(d => ({
    google_books_id: d.key.replace(/^\/works\//, ""),
    title:       d.title,
    author:      (d.author_name || []).slice(0, 2).join(", "),
    cover_url:   d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
    summary:     null,
    rating:      null,
    rating_link: `https://openlibrary.org${d.key}`,
    genres:      (d.subject || []).slice(0, 4).join(", ") || null,
  }))

  return NextResponse.json({ results })
}
