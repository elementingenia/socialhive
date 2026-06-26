import { NextResponse } from "next/server"

// Details endpoint — Google Books search already returns summary + rating,
// so this is only hit for legacy OL IDs or as a fallback.
// For Google Books IDs (not starting with OL), fetch from GB API.
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const key = searchParams.get("key")
  if (!key) return NextResponse.json({})

  // Legacy Open Library ID — skip enrichment (OL is unreliable from Vercel)
  if (key.startsWith("OL")) {
    return NextResponse.json({})
  }

  // Google Books ID
  const url = `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(key)}`
  let res
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    res = await fetch(url, { signal: controller.signal, cache: "no-store" })
    clearTimeout(timeout)
  } catch {
    return NextResponse.json({})
  }
  if (!res.ok) return NextResponse.json({})

  const item = await res.json()
  const info = item.volumeInfo || {}
  return NextResponse.json({
    summary:     info.description || null,
    rating:      info.averageRating ? parseFloat(info.averageRating).toFixed(1) : null,
    rating_link: info.infoLink || `https://books.google.com/books?id=${key}`,
  })
}
