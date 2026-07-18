"use client"
import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"

// Resolves the club you're currently inside (/clubs/<slug>/...), so chrome —
// the header accent bar, the page title, the bottom nav — can use that club's
// OWN colour and name instead of a generic "Clubs" purple. Kept out of
// lib/clubs.js so that stays pure (it's imported by the node unit tests).
export function useActiveClub() {
  const pathname = usePathname()
  const slug = pathname?.startsWith("/clubs/") ? pathname.split("/")[2] : null
  const [club, setClub] = useState(null)

  useEffect(() => {
    if (!slug) { setClub(null); return }
    let cancelled = false
    supabase.from("clubs").select("id, name, slug, colour, catalogue_module")
      .eq("slug", slug).maybeSingle()
      .then(({ data }) => { if (!cancelled) setClub(data || null) })
    return () => { cancelled = true }
  }, [slug])

  return club
}
