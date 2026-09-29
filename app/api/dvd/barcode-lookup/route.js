import { NextResponse } from 'next/server'

// Resolves a scanned UPC/EAN barcode to a product title via UPCitemdb's
// free trial endpoint (no API key, IP-rate-limited: 100 combined lookups/
// day, see Element_Happenings_DVD_Barcode_Add_Scope_Answered.md). This is a
// retail-SKU lookup, not a movie database — it gets us a product title
// (e.g. "The Dark Knight (Two-Disc Special Edition) [DVD]"), which the
// caller then feeds into the existing /api/tmdb/search flow the same way a
// manually-typed title would be. UPCitemdb has no dedicated DVD/media
// coverage guarantee and skews US-retail, so a miss here is expected and
// normal for older, ex-rental, or AU-market discs — the caller's job is to
// offer a rescan then fall back to manual title entry, not to treat a miss
// as an error.
export async function GET(req) {
  const code = new URL(req.url).searchParams.get('code')?.replace(/\D/g, '')
  if (!code || code.length < 8) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`,
      { signal: controller.signal, cache: 'no-store' }
    )
    clearTimeout(timeout)

    if (res.status === 429) {
      return NextResponse.json({ error: 'rate_limited', title: null }, { status: 200 })
    }
    if (!res.ok) {
      return NextResponse.json({ error: 'lookup_unavailable', title: null }, { status: 200 })
    }

    const data = await res.json()
    const item = (data.items || [])[0]
    if (!item?.title) {
      return NextResponse.json({ title: null })
    }
    return NextResponse.json({ title: item.title, brand: item.brand || null })
  } catch (err) {
    // Timeout/network — treated the same as a miss client-side (non-fatal,
    // the scan-first flow always has manual entry to fall back to).
    return NextResponse.json({ error: 'lookup_unavailable', title: null }, { status: 200 })
  }
}
