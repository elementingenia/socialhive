"use client"
import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

// The shared on-site venue list (migration 050). Admin-managed in
// Admin > Locations, used by every event form rather than each hub keeping
// its own hardcoded array.
export function useLocations() {
  const [locations, setLocations] = useState([])
  useEffect(() => {
    supabase.from("locations").select("id, name").eq("archived", false)
      .order("sort_order").order("name")
      .then(({ data }) => setLocations((data || []).map(l => l.name)))
  }, [])
  return locations
}
