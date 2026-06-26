import { NextResponse } from "next/server"

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  const apiKey = process.env.GOOGLE_BOOKS_API_KEY
  const keyParam = apiKey ? `&key=${apiKey}` : ""
  const url = `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(q)}&maxResults=20&printType=books&langRestrict=en${keyParam}`

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
  const qNorm = q.toLowerCase().trim()
  const seen  = new Set()

  const items = (data.items || []).filter(item => {
    const info = item.volumeInfo
    if (!info?.title || !info?.authors?.length) return false
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

  const results = deduped.slice(0, 8).map(item => {
    const info = item.volumeInfo
    const cover = info.imageLinks?.thumbnail?.replace("http://", "https://") || null
    return {
      google_books_id: item.id,
      title:       info.title,
      author:      (info.authors || []).slice(0, 2).join(", "),
      cover_url:   cover,
      summary:     info.description || null,
      rating:      info.averageRating ? parseFloat(info.averageRating).toFixed(1) : null,
      rating_link: info.infoLink || `https://books.google.com/books?id=${item.id}`,
      genres:      (info.categories || []).slice(0, 4).join(", ") || null,
    }
  })

  return NextResponse.json({ results })
}
