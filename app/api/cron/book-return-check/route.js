import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { notify } from "@/lib/notify"

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Daily catch-all for Book Club kit copies still out past their due date
// (Iain, 2026-07-15) -- the manual "remind" bell on the attendee list
// (app/api/coordinator/route.js's remind_book_return) covers a proactive
// nudge at any time; this covers the case nobody remembered to send one.
// Triggered by Vercel Cron (see vercel.json) once a day. GET only, since
// Vercel Cron always issues GET requests.
//
// Auth: Vercel automatically sends `Authorization: Bearer <CRON_SECRET>`
// on cron-triggered requests when that env var is set on the project --
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
// Fails closed: if CRON_SECRET isn't configured yet, every request is
// rejected rather than left open, same reasoning as lib/push.js's
// ensureConfigured() but inverted (there, missing config means "no-op
// silently"; here, missing config means "this endpoint can spam every
// resident with a book out," so it must not run unconfigured).
//
// Once-only per loan cycle: only considers a booking if
// book_return_reminded_at is NULL or older than book_given_at -- so a book
// lent out again after being returned gets a fresh reminder cycle, but a
// given loan is only ever auto-reminded once, not daily, per Iain's call
// (2026-07-15) to avoid notification fatigue.
export async function GET(req) {
  const configuredSecret = process.env.CRON_SECRET
  if (!configuredSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  }
  const auth = req.headers.get("authorization") || ""
  if (auth !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const todayStr = new Date().toISOString().slice(0, 10) // YYYY-MM-DD, matches events.book_return_date's date type

  // Filtering on the joined event's date via a dotted-path PostgREST filter
  // (.lt("events.book_return_date", ...)) turned out not to be reliable from
  // this route in practice -- confirmed live 2026-07-15: the identical query
  // returned the correct row every time when run directly against Supabase
  // (curl and a local supabase-js script), but consistently returned zero
  // rows when executed from this deployed route. Rather than chase that
  // discrepancy further, this fetches every current loan (has_book = true --
  // always a small number for a community this size) and does the date
  // comparison in plain JS instead, which is easy to reason about and not
  // dependent on any embedded-resource filter behaviour.
  const { data: outstanding, error } = await supa
    .from("bookings")
    .select("id, member_id, has_book, book_given_at, book_return_reminded_at, event_id, events(id, title, book_return_date, book_snapshot, books(title))")
    .eq("has_book", true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const due = (outstanding || []).filter(b => {
    const returnDate = b.events?.book_return_date
    if (!returnDate || returnDate >= todayStr) return false // not due yet, or no due date set
    if (!b.book_return_reminded_at) return true
    if (!b.book_given_at) return true
    return new Date(b.book_return_reminded_at).getTime() < new Date(b.book_given_at).getTime()
  })

  let reminded = 0
  for (const b of due) {
    const ev = b.events
    const bookTitle = ev?.books?.title || ev?.book_snapshot?.title || ev?.title || "this book"
    let dueText = ""
    if (ev?.book_return_date) {
      const [y, m, d] = ev.book_return_date.split("-").map(Number)
      dueText = ` (due back ${new Date(y, m - 1, d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })})`
    }
    await notify(b.member_id, b.event_id, "book_return_overdue",
      `Your copy of "${bookTitle}" is overdue${dueText} -- please return it to the coordinator.`)
    await supa.from("bookings").update({ book_return_reminded_at: new Date().toISOString() }).eq("id", b.id)
    reminded++
  }

  const { searchParams } = new URL(req.url)
  const debugPayload = searchParams.get("debug")
    ? { todayStr, outstanding, due: due.map(b => ({ id: b.id, book_given_at: b.book_given_at, book_return_reminded_at: b.book_return_reminded_at, return_date: b.events?.book_return_date })) }
    : undefined

  return NextResponse.json({ ok: true, checked: (outstanding || []).length, reminded, ...(debugPayload ? { debug: debugPayload } : {}) })
}
