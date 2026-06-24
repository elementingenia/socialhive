import { NextResponse } from "next/server"

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=10&langRestrict=en`
  const res = await fetch(url)
  if (!res.ok) return NextResponse.json({ results: [] })

  const data = await res.json()
  const results = (data.items || []).map(item => {
    const info = item.volumeInfo || {}
    const cover = (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "")
      .replace("http://", "https://")
      .replace("&edge=curl", "")
      .replace("zoom=1", "zoom=2")
    return {
      google_books_id: item.id,
      title:       info.title || "",
      author:      (info.authors || []).join(", "),
      cover_url:   cover || null,
      summary:     info.description || "",
      rating:      info.averageRating ? String(info.averageRating) : null,
      rating_link: `https://books.google.com/books?id=${item.id}`,
      genres:      (info.categories || []).join(", ") || null,
    }
  }).filter(r => r.title)

  return NextResponse.json({ results })
}
