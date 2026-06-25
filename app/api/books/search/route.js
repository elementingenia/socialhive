import { NextResponse } from "next/server"

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  // Fetch more than needed — we filter hard below
  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(q)}&limit=30&sort=edition_count&fields=key,title,author_name,cover_i,subject,first_publish_year,edition_count`
  const res = await fetch(url, { next: { revalidate: 0 } })
  if (!res.ok) return NextResponse.json({ results: [] })

  const data = await res.json()
  const qNorm = q.toLowerCase().trim()

  const seen = new Set()

  const results = (data.docs || [])
    // Must have title + at least one named author
    .filter(d => d.title && d.author_name?.length)
    // Must have a cover — no cover = obscure edition, skip it
    .filter(d => !!d.cover_i)
    // Title relevance: query must appear in the main title (before any colon/dash)
    // This kills "Implementation: how great expectations in Washington..." etc.
    .filter(d => {
      const mainTitle = d.title.toLowerCase().split(/[:\-–]/)[0].trim()
      return mainTitle.includes(qNorm)
    })
    // Deduplicate by normalised title + first author
    .filter(d => {
      const key = `${d.title.toLowerCase().trim()}|||${(d.author_name[0] || '').toLowerCase().trim()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)
    .map(d => ({
      google_books_id: d.key.replace(/^\/works\//, ""),
      title:       d.title,
      author:      (d.author_name || []).slice(0, 2).join(", "),
      cover_url:   `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`,
      summary:     null,
      rating:      null,
      rating_link: `https://openlibrary.org${d.key}`,
      genres:      (d.subject || []).slice(0, 4).join(", ") || null,
    }))

  return NextResponse.json({ results })
}
