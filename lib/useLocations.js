"use client"
import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

// The shared on-site venue list (migration 050). Admin-managed in
// Admin > Locations, used by every event form rather than each hub keeping
// its own hardcoded array.
export function useLocations() {
  const [locations, setLocations] = useState([])
  useEffect(() => {
    supabase.from("locations").select("id, name, bookable").eq("archived", false)
      .order("sort_order").order("name")
      // Keep the WHOLE row. This used to `.map(l => l.name)` — throwing the id
      // away one line after selecting it — which is why the entire chain became
      // name-based: the picker only had a name to give, so the event stored a
      // name, so the server had to look the id back up from that name, so a
      // rename broke the binding. The id never leaves the pipeline now.
      .then(({ data }) => setLocations(data || []))
  }, [])
  return locations
}
