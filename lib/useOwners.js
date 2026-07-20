"use client"
import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"

// Owners of a space (hub or club) — see Social_Hive_Questions_Scope.md.
// contextType: 'hub' | 'club'; contextKey: 'movie'/'social' for a hub, or a club id.
export function useOwners(contextType, contextKey) {
  const [owners, setOwners]   = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!contextType || !contextKey) { setOwners([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from("space_owners")
      .select("id, member_id, members(id, name)")
      .eq("context_type", contextType)
      .eq("context_key", String(contextKey))
    const rows = (data || [])
      .map(r => ({ rowId: r.id, id: r.member_id, name: r.members?.name || "Resident" }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    setOwners(rows)
    setLoading(false)
  }, [contextType, contextKey])

  useEffect(() => { reload() }, [reload])
  return { owners, loading, reload }
}
