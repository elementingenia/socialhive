"use client"
import { useEffect, useState } from "react"
import { authedFetch } from "@/lib/getAuthToken"

// Client side of app/api/events/waitlist -- see that route for why this
// can't be a direct Supabase query from the browser (bookings RLS hides
// other residents' waitlist rows, so a client count is always wrong for
// non-admins).
//
// Returns { [event_id]: { position, my_waitlist_seats, waitlist_count,
// waitlist_seats } }. Fails soft to {} -- a missing position just falls
// back to plain "On waitlist", never breaks the page.
export async function fetchWaitlistInfo(eventIds) {
  const ids = [...new Set((eventIds || []).filter(Boolean))]
  if (!ids.length) return {}
  try {
    const res = await authedFetch(`/api/events/waitlist?event_ids=${ids.map(encodeURIComponent).join(",")}`, { cache: "no-store" })
    if (!res.ok) return {}
    return (await res.json()) || {}
  } catch {
    return {}
  }
}

// Hook form. `refreshKey` lets a caller force a re-fetch after a booking
// change (pass anything that changes when bookings reload).
export function useWaitlistInfo(eventIds, refreshKey) {
  const [info, setInfo] = useState({})
  const key = [...new Set((eventIds || []).filter(Boolean))].sort().join(",")
  useEffect(() => {
    let cancelled = false
    if (!key) { setInfo({}); return }
    fetchWaitlistInfo(key.split(",")).then(d => { if (!cancelled) setInfo(d) })
    return () => { cancelled = true }
  }, [key, refreshKey])
  return info
}
