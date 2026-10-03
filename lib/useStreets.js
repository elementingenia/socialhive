"use client"
import { useEffect, useState } from "react"
import { authedFetch } from "@/lib/getAuthToken"

// The admin-managed street list (migration 122), A-Z. null while loading,
// [] if none set up yet (pickers then show nothing at all).
export function useStreets() {
  const [streets, setStreets] = useState(null)
  useEffect(() => {
    let live = true
    authedFetch("/api/streets")
      .then(r => (r.ok ? r.json() : { streets: [] }))
      .then(d => { if (live) setStreets(d.streets || []) })
      .catch(() => { if (live) setStreets([]) })
    return () => { live = false }
  }, [])
  return streets
}
