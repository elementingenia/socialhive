"use client"
import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

// The shared on-site venue list (migration 050). Admin-managed in
// Admin > Locations, used by every event form rather than each hub keeping
// its own hardcoded array.
export function useLocations() {
  const [locations, setLocations] = useState([])
  useEffect(() => {
    // A-Z, always. Iain, 2026-07-31: "the list of venues should be sorted
    // logically i.e. A-z. This should be true at all times for all dropdowns
    // unless otherwise stated." sort_order used to win here, which meant the
    // dropdown showed insertion order — and nothing in the UI can even edit
    // sort_order, so it was arbitrary.
    supabase.from("locations").select("id, name, bookable, booking_status").eq("archived", false)
      .order("name")
      // Keep the WHOLE row. This used to `.map(l => l.name)` — throwing the id
      // away one line after selecting it — which is why the entire chain became
      // name-based: the picker only had a name to give, so the event stored a
      // name, so the server had to look the id back up from that name, so a
      // rename broke the binding. The id never leaves the pipeline now.
      .then(({ data }) => setLocations(data || []))
  }, [])
  return locations
}
