import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { requireAdminOrAreaOwner } from "@/lib/areaAuth"

// Outstanding kit copies for one club (Admin clean-up, Iain 2026-10-10:
// the old Admin > Book Club tile moves to Book Club's own Manage screen so
// its Owner can use it too). Service role on purpose: bookings RLS
// (migration 020) only shows a non-admin other residents' CONFIRMED
// bookings, and this list deliberately includes cancelled bookings that
// still hold a book -- read client-side, an Owner would silently miss them.
// Mark Returned goes through PATCH /api/coordinator set_has_book (admin,
// area Owner or that event's EC).
export const dynamic = "force-dynamic"

export async function GET(req) {
  const clubId = new URL(req.url).searchParams.get("club_id")
  if (!clubId) return NextResponse.json({ error: "club_id required" }, { status: 400 })

  const { error, status } = await requireAdminOrAreaOwner(req, "club", clubId)
  if (error) return NextResponse.json({ error }, { status })

  const { data, error: qe } = await supabaseAdmin
    .from("bookings")
    .select("id, status, has_book, book_given_at, name_hidden, members(name, display_name, username, hide_name), contacts(name), events!inner(id, title, club_id, book_return_date, book_snapshot, books(title))")
    .eq("has_book", true)
    .eq("events.club_id", clubId)
    .order("book_given_at", { ascending: true })
  if (qe) return NextResponse.json({ error: qe.message }, { status: 500 })

  // Same masking as the old Admin view: a Private resident shows as
  // "Resident". Admins and the Owner see the same list.
  const rows = (data || []).map(r => {
    const hidden = r.members?.hide_name || r.name_hidden
    const name = hidden
      ? "Resident"
      : (r.members?.display_name || r.members?.name || r.members?.username || r.contacts?.name || "—")
    return {
      id: r.id,
      eventId: r.events?.id,
      name,
      cancelled: r.status === "cancelled",
      bookTitle: r.events?.books?.title || r.events?.book_snapshot?.title || r.events?.title || "Unknown book",
      givenAt: r.book_given_at,
      returnDate: r.events?.book_return_date || null,
    }
  })
  return NextResponse.json({ rows })
}
