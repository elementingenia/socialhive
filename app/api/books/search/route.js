import { NextResponse } from "next/server"

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(q)}&limit=12&fields=key,title,author_name,cover_i,subject,first_publish_year`
  const res = await fetch(url, { next: { revalidate: 0 } })
  if (!res.ok) return NextResponse.json({ results: [] })

  const data = await res.json()
  const results = (data.docs || [])
    .filter(d => d.title && d.author_name?.length)
    .slice(0, 10)
    .map(d => ({
      google_books_id: d.key.replace(/^\/works\//, ""),  // store clean ID e.g. OL82586W
      title:     d.title,
      author:    (d.author_name || []).slice(0, 2).join(", "),
      cover_url: d.cover_i
        ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`
        : null,
      summary:   null,
      rating:    null,
      rating_link: `https://openlibrary.org${d.key}`,  // full path still fine for link
      genres:    (d.subject || []).slice(0, 4).join(", ") || null,
    }))

  return NextResponse.json({ results })
}
