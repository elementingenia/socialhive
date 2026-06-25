import { NextResponse } from "next/server"

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const key = searchParams.get("key")  // e.g. OL82586W (clean ID, no slashes)
  if (!key) return NextResponse.json({})

  // Reconstruct full Open Library path
  const workPath = key.startsWith("/works/") ? key : `/works/${key}`
  const base = `https://openlibrary.org${workPath}`

  const [workRes, ratingsRes] = await Promise.allSettled([
    fetch(`${base}.json`,         { next: { revalidate: 86400 } }),
    fetch(`${base}/ratings.json`, { next: { revalidate: 86400 } }),
  ])

  let summary = null
  let rating  = null
  let rating_link = `https://openlibrary.org${key.startsWith('/works/') ? key : '/works/' + key}`

  if (workRes.status === "fulfilled" && workRes.value.ok) {
    const work = await workRes.value.json()
    const desc = work.description
    if (desc) {
      summary = typeof desc === "string" ? desc : (desc.value || null)
    }
  }

  if (ratingsRes.status === "fulfilled" && ratingsRes.value.ok) {
    const r = await ratingsRes.value.json()
    const avg = r?.summary?.average
    if (avg) rating = parseFloat(avg).toFixed(1)
  }

  return NextResponse.json({ summary, rating, rating_link })
}
