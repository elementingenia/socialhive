import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
import { requireAdminOrAreaOwner } from '@/lib/areaAuth'

// Mirrors app/api/admin/dvd-add/route.js — same shape (search client-side,
// re-fetch full details server-side by id, dedupe, insert we_own=true) —
// but against Google Books instead of TMDB/OMDb.
export async function POST(req) {
  const { error, status } = await requireAdminOrAreaOwner(req, 'hub', 'library')
  if (error) return NextResponse.json({ error }, { status })

  const { google_books_id } = await req.json()
  if (!google_books_id) return NextResponse.json({ error: 'google_books_id required' }, { status: 400 })

  const db = supabaseAdmin

  // Duplicate check — already in the Book Library
  const { data: existing } = await db
    .from('books')
    .select('id, title')
    .eq('we_own', true)
    .eq('google_books_id', google_books_id)
    .maybeSingle()
  if (existing) return NextResponse.json({ error: `"${existing.title}" is already in the Book Library` }, { status: 409 })

  // Re-fetch from Google Books server-side rather than trusting client-
  // supplied fields (same discipline as dvd-add re-fetching from TMDB/OMDb).
  // Bug fixed 2026-08-12: this fetch was missing the API key that
  // /api/books/search and /api/books/details both already send — the
  // by-ID endpoint enforces a much stricter anonymous quota than search,
  // so every add attempt was failing with "Could not fetch book details"
  // even though GOOGLE_BOOKS_API_KEY was set in Vercel the whole time.
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY
  const keyParam = apiKey ? `?key=${apiKey}` : ''
  let item
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(google_books_id)}${keyParam}`,
      { signal: controller.signal, cache: 'no-store' }
    )
    clearTimeout(timeout)
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      return NextResponse.json({ error: errBody?.error?.message || 'Could not fetch book details' }, { status: 502 })
    }
    item = await res.json()
  } catch (err) {
    return NextResponse.json({ error: 'Google Books lookup failed: ' + err.message }, { status: 502 })
  }

  const info = item.volumeInfo || {}
  if (!info.title) return NextResponse.json({ error: 'Book not found' }, { status: 404 })

  // ISBN_13 preferred over ISBN_10 when both are present (matches
  // /api/books/search's extractIsbn) -- stored for both title-based and
  // barcode-based adds, since Google returns industryIdentifiers either way.
  const ids = info.industryIdentifiers || []
  const isbn = (ids.find(x => x.type === 'ISBN_13') || ids.find(x => x.type === 'ISBN_10'))?.identifier || null

  const row = {
    google_books_id,
    title:          info.title,
    author:         (info.authors || []).slice(0, 3).join(', ') || null,
    cover_url:      info.imageLinks?.thumbnail?.replace('http://', 'https://') || null,
    summary:        info.description || null,
    rating:         info.averageRating ? parseFloat(info.averageRating).toFixed(1) : null,
    rating_link:    info.infoLink || `https://books.google.com/books?id=${google_books_id}`,
    genre:          (info.categories || []).slice(0, 4).join(', ') || null,
    published_year: info.publishedDate ? (parseInt(info.publishedDate.substring(0, 4), 10) || null) : null,
    isbn,
    we_own:         true,
  }

  const { data: inserted, error: insError } = await db.from('books').insert(row).select('id, title').single()
  if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })

  return NextResponse.json({ id: inserted.id, title: inserted.title })
}
