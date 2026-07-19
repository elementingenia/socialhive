"use client"
import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"

// The set of club IDs the current member has joined (club_members). Shared by
// the Clubs hub list and the calendar filter so "My clubs" means the same
// thing in both. `loaded` distinguishes "still loading" from "joined none".
export function useMyClubs() {
  const { member } = useUser()
  const [ids, setIds] = useState(() => new Set())
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!member?.id) { setIds(new Set()); setLoaded(true); return }
    supabase.from("club_members").select("club_id").eq("member_id", member.id)
      .then(({ data }) => { setIds(new Set((data || []).map(r => r.club_id))); setLoaded(true) })
  }, [member?.id])
  return { myClubIds: ids, loaded }
}
