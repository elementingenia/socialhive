"use client"
import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import ClubHome from "@/components/ClubHome"

// Generic per-club page (Phase 2b). Loads the club's config by slug and hands
// it to the shared ClubHome engine — the same component Book Club runs on, so
// behaviour is driven by the club's flags rather than a hardcoded hub.
export default function ClubPage() {
  const router = useRouter()
  const { slug } = useParams()
  const [club, setClub] = useState(undefined) // undefined = loading, null = not found

  useEffect(() => {
    if (!slug) return
    supabase.from("clubs").select("*").eq("slug", slug).eq("archived", false).maybeSingle()
      .then(({ data }) => setClub(data || null))
  }, [slug])

  if (club === undefined) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}><div className="spinner" /></div>
  }
  if (club === null) {
    return (
      <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--text-dim)" }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🐝</div>
        This club couldn&apos;t be found.
        <div style={{ marginTop: "1rem" }}>
          <button onClick={() => router.push("/clubs")} style={{ background: "var(--purple)", color: "#fff", border: "none", borderRadius: 10, padding: "0.6rem 1.2rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Back to Clubs</button>
        </div>
      </div>
    )
  }
  return <ClubHome club={club} />
}
