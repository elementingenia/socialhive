import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
import { requireAdminOrAreaOwner } from '@/lib/areaAuth'
import { googleBooksGet, mapGoogleVolume, openLibraryByIsbn, isOpenLibraryId, normaliseIsbn, isValidIsbn, bookRowFields, manualBookRow } from '@/lib/bookLookup'

export const maxDuration = 20

// Mirrors app/api/admin/dvd-add/route.js — same shape (search client-side,
// re-fetch full details server-side by id, dedupe, insert we_own=true) —
// but against Google Books instead of TMDB/OMDb.
export async function POST(req) {
  const { error, status } = await requireAdminOrAreaOwner(req, 'hub', 'library')
  if (error) return NextResponse.json({ error }, { status })

  const body = await req.json().catch(() => ({}))

  // Manual entry (BUG-092): the book isn't on Google Books or Open Library
  // (e.g. a recent Australian edition), so the Owner/admin types the title,
  // author and barcode themselves. No external id; the enrichment task can
  // still fill in cover/summary later from the ISBN if a source adds it.
  if (body.manual) {
    const m = manualBookRow(body)
    if (m.error) return NextResponse.json({ error: m.error }, { status: 400 })
    if (m.row.isbn) {
      const { data: sameIsbn } = await supabaseAdmin
        .from('books').select('id, title').eq('we_own', true).eq('isbn', m.row.isbn).limit(1).maybeSingle()
      if (sameIsbn) return NextResponse.json({ error: `"${sameIsbn.title}" is already in the Book Library` }, { status: 409 })
    }
    const { data: sameTitle } = await supabaseAdmin
      .from('books').select('id, title, author').eq('we_own', true).ilike('title', m.row.title).limit(5)
    const clash = (sameTitle || []).find(b => !m.row.author || !b.author || b.author.toLowerCase() === m.row.author.toLowerCase())
    if (clash) return NextResponse.json({ error: `"${clash.title}" is already in the Book Library` }, { status: 409 })
    const { data: inserted, error: insError } = await supabaseAdmin
      .from('books').insert({ ...m.row, we_own: true }).select('id, title').single()
    if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })
    return NextResponse.json({ id: inserted.id, title: inserted.title })
  }

  const google_books_id = body.google_books_id
  const isbn = isValidIsbn(normaliseIsbn(body.isbn)) ? normaliseIsbn(body.isbn) : null
  if (!google_books_id) return NextResponse.json({ error: 'google_books_id required' }, { status: 400 })

  const db = supabaseAdmin

  // Duplicate check — already in the Book Library (same Google/Open Library id)
  const { data: existing } = await db
    .from('books')
    .select('id, title')
    .eq('we_own', true)
    .eq('google_books_id', google_books_id)
    .maybeSingle()
  if (existing) return NextResponse.json({ error: `"${existing.title}" is already in the Book Library` }, { status: 409 })

  // Re-fetch server-side rather than trusting client-supplied fields (same
  // discipline as dvd-add re-fetching from TMDB/OMDb).
  // BUG-088 (2026-10-11): Google Books has been answering most calls with a
  // 503, so this now retries Google and, if it still can't be reached (or the
  // result came from Open Library in the first place), looks the copy up on
  // Open Library by its ISBN — see lib/bookLookup.js.
  let result = null
  if (!isOpenLibraryId(google_books_id)) {
    const g = await googleBooksGet(`volumes/${encodeURIComponent(google_books_id)}`)
    if (g.ok && g.data?.volumeInfo?.title) {
      result = mapGoogleVolume(g.data)
      result.author = (g.data.volumeInfo.authors || []).slice(0, 3).join(', ')
    } else if (!isbn) {
      return NextResponse.json({ error: g.error === 'quota_exceeded'
        ? "Book lookup has hit today's usage limit — try again later."
        : 'Book lookup is temporarily unavailable — try again in a moment.' }, { status: 502 })
    }
  }
  if (!result) {
    if (!isbn) return NextResponse.json({ error: 'isbn required for this book' }, { status: 400 })
    const ol = await openLibraryByIsbn(isbn)
    if (!ol.ok) return NextResponse.json({ error: 'Book lookup is temporarily unavailable — try again in a moment.' }, { status: 502 })
    if (!ol.result) return NextResponse.json({ error: 'Book not found' }, { status: 404 })
    result = ol.result
  }

  // Same copy already shelved under a different id (e.g. once from Google,
  // once from Open Library) — match on ISBN too.
  if (result.isbn) {
    const { data: sameIsbn } = await db
      .from('books').select('id, title').eq('we_own', true).eq('isbn', result.isbn).limit(1).maybeSingle()
    if (sameIsbn) return NextResponse.json({ error: `"${sameIsbn.title}" is already in the Book Library` }, { status: 409 })
  }

  // publisher (2026-08-13, migration 082): whatever edition the source
  // resolved to -- for a physical-copy import where the exact printing
  // matters, the caller should overwrite this after insert.
  const row = { ...bookRowFields(result), we_own: true }

  const { data: inserted, error: insError } = await db.from('books').insert(row).select('id, title').single()
  if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })

  return NextResponse.json({ id: inserted.id, title: inserted.title })
}
