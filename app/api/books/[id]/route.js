import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
import { requireAdminOrAreaOwner } from '@/lib/areaAuth'

// Book Library delete — admin OR this hub's Owner, per the Owner
// self-service model (Owner_SelfService_and_Library_Hub_Scope_v1 Part A).
// Movies' equivalent (app/api/movies/[id]/route.js) is still admin-only —
// left as a follow-up, not retrofitted here, see PR description.
export async function DELETE(req, { params }) {
  const { error, status } = await requireAdminOrAreaOwner(req, 'hub', 'library')
  if (error) return NextResponse.json({ error }, { status })

  const { id } = params

  // Delete associated loans first (no CASCADE assumed beyond FK ON DELETE
  // CASCADE already set in migration 080, but explicit delete keeps this
  // route correct even if that changes).
  await supabaseAdmin.from('book_loans').delete().eq('book_id', id)

  const { error: delError } = await supabaseAdmin.from('books').delete().eq('id', id)
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

// Strips anything but digits/X, same as app/api/books/search/route.js's
// normaliseIsbn, so "978-0-14-118535-4" and a bare 13-digit code both
// validate the same way.
function normaliseIsbn(raw) {
  return (raw || "").toUpperCase().replace(/[^0-9X]/g, "")
}

// Edit/add a book's ISBN — Iain, 2026-08-31: "it would be good if we could
// edit the ISBN. So if already saved, changing it would run the search for
// that bar code, refreshing to the new code (assuming it was different).
// When no code is stored, allowing a user to enter one." Admin/Owner-gated,
// same as Delete above — this is a data-correction action, not a general
// resident-facing one, matching every other mutation in this hub.
export async function PATCH(req, { params }) {
  const { error, status } = await requireAdminOrAreaOwner(req, 'hub', 'library')
  if (error) return NextResponse.json({ error }, { status })

  const { id } = params
  const body = await req.json().catch(() => ({}))
  const rawIsbn = typeof body.isbn === 'string' ? body.isbn.trim() : ''
  const isbn = normaliseIsbn(rawIsbn)

  if (rawIsbn && !/^(\d{9}[\dX]|\d{13})$/.test(isbn)) {
    return NextResponse.json({ error: 'invalid_isbn' }, { status: 400 })
  }

  const { data: book, error: fetchErr } = await supabaseAdmin
    .from('books').select('id, isbn').eq('id', id).maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 })

  // Clearing the ISBN entirely (empty submission) — no re-search needed.
  if (!rawIsbn) {
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('books').update({ isbn: null }).eq('id', id).select().single()
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
    return NextResponse.json({ book: updated, refreshed: false })
  }

  // Unchanged from what's already stored — nothing to re-search, don't
  // spend a Google Books request on a no-op (see the project's standing
  // 1,000-request/day quota cap, BUG-028).
  if (book.isbn && normaliseIsbn(book.isbn) === isbn) {
    return NextResponse.json({ book, refreshed: false, unchanged: true })
  }

  // Re-search Google Books for the new code, same lookup
  // /api/books/search's ISBN mode uses, and refresh the book's data from
  // whatever it finds — "refreshing to the new code" per Iain's request,
  // not just swapping the stored digits.
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY
  const keyParam = apiKey ? `&key=${apiKey}` : ""
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1&printType=books${keyParam}`

  let item = null
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    clearTimeout(timeout)
    if (res.ok) {
      const data = await res.json()
      item = (data.items || [])[0] || null
    } else if (res.status === 429) {
      return NextResponse.json({ error: 'quota_exceeded' }, { status: 429 })
    } else {
      return NextResponse.json({ error: 'search_unavailable' }, { status: 503 })
    }
  } catch (err) {
    console.error('Google Books ISBN re-search failed:', err?.message)
    return NextResponse.json({ error: 'search_unavailable' }, { status: 503 })
  }

  let updateFields = { isbn }
  if (item) {
    const info = item.volumeInfo || {}
    updateFields = {
      isbn,
      google_books_id: item.id,
      title:          info.title || undefined,
      author:         (info.authors || []).slice(0, 3).join(', ') || undefined,
      cover_url:      info.imageLinks?.thumbnail?.replace('http://', 'https://') || undefined,
      summary:        info.description || undefined,
      rating:         info.averageRating ? parseFloat(info.averageRating).toFixed(1) : undefined,
      rating_link:    info.infoLink || `https://books.google.com/books?id=${item.id}`,
      genre:          (info.categories || []).slice(0, 4).join(', ') || undefined,
      published_year: info.publishedDate ? (parseInt(info.publishedDate.substring(0, 4), 10) || undefined) : undefined,
      publisher:      info.publisher || undefined,
    }
    Object.keys(updateFields).forEach(k => updateFields[k] === undefined && delete updateFields[k])
  }
  // No match found — the ISBN itself is still saved (Iain's spec doesn't
  // say to reject an unmatched code, just to refresh IF the search finds
  // something different), just nothing else changes.

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('books').update(updateFields).eq('id', id).select().single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ book: updated, refreshed: !!item, found: !!item })
}
