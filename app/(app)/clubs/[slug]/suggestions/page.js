"use client"
import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { clubCaps } from "@/lib/clubs"
import BookCatalogue from "@/components/BookCatalogue"

// The catalogue / "Suggest" page for a club. This is the pluggable module slot
// from the scope: today the only implemented module is `books` (Book Club's
// Google Books search + community voting). A club with catalogue_module 'none'
// has no Suggest tab at all, so landing here is a wrong turn — bounce back.
export default function ClubSuggestionsPage() {
  const router = useRouter()
  const { slug } = useParams()
  const [club, setClub] = useState(undefined)

  useEffect(() => {
    if (!slug) return
    supabase.from("clubs").select("*").eq("slug", slug).eq("archived", false).maybeSingle()
      .then(({ data }) => setClub(data || null))
  }, [slug])

  useEffect(() => {
    if (club !== undefined && club !== null && !clubCaps(club).hasBooks) {
      router.replace(`/clubs/${slug}`)
    }
  }, [club, slug, router])

  if (club === undefined || (club && !clubCaps(club).hasBooks)) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}><div className="spinner" /></div>
  }
  if (club === null) {
    return (
      <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--text-dim)" }}>
        This club couldn&apos;t be found.
      </div>
    )
  }
  return <BookCatalogue />
}
