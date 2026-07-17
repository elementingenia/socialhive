"use client"
import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

// Generic per-club page (Phase 2a shell). Book Club redirects to its existing
// /bookclub page until the 2b migration replaces this shell with the full
// engine (events, sign-up, catalogue). Other clubs show a lightweight
// placeholder — the club exists and is configured, its events come in 2d.
export default function ClubPage() {
  const router = useRouter()
  const { slug } = useParams()
  const [club, setClub] = useState(undefined) // undefined = loading, null = not found

  useEffect(() => {
    if (!slug) return
    if (slug === "book-club") { router.replace("/bookclub"); return }
    supabase.from("clubs").select("id, name, slug, description, colour")
      .eq("slug", slug).eq("archived", false).maybeSingle()
      .then(({ data }) => setClub(data || null))
  }, [slug, router])

  if (slug === "book-club" || club === undefined) {
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

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "1rem 1rem 6rem" }}>
      <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text)", margin: "0 0 0.5rem", borderLeft: `4px solid ${club.colour || "var(--purple)"}`, paddingLeft: "0.6rem" }}>{club.name}</h1>
      {club.description && <p style={{ fontSize: "0.9rem", color: "var(--text-dim)", lineHeight: 1.5 }}>{club.description}</p>}
      <div style={{ marginTop: "2rem", background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: "12px", padding: "2rem 1rem", textAlign: "center", color: "var(--text-dim)" }}>
        <div style={{ fontSize: "1.6rem", marginBottom: "0.5rem" }}>📅</div>
        <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: "0.25rem" }}>This club is set up</div>
        <div style={{ fontSize: "0.85rem" }}>Events and sign-ups are coming soon.</div>
      </div>
    </div>
  )
}
