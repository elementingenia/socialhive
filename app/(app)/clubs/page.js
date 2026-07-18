"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ClubsIcon } from "@/components/NavIcons"

// Clubs hub. Lists every active club from the `clubs` table; each opens the
// generic /clubs/[slug] page (Phase 2b — including Book Club, which now runs on
// the same shared engine). Anyone can open any club — joining (Phase 2c) only
// controls notices, not access.
export default function ClubsHome() {
  const router = useRouter()
  const [clubs, setClubs] = useState(null)

  useEffect(() => {
    supabase.from("clubs").select("id, name, slug, description, colour")
      .eq("archived", false).order("sort_order").order("name")
      .then(({ data }) => setClubs(data || []))
  }, [])

  function openClub(c) {
    router.push(`/clubs/${c.slug}`)
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "1rem 1rem 6rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
        <span style={{ color: "var(--purple)", lineHeight: 0 }}><ClubsIcon size={30} /></span>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text)", margin: 0 }}>Clubs</h1>
      </div>

      {clubs === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}><div className="spinner" /></div>
      ) : clubs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-dim)" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🐝</div>
          No clubs yet. An admin can add one from the Club Manager.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {clubs.map(c => (
            <button key={c.id} onClick={() => openClub(c)} style={{
              textAlign: "left", background: "var(--surface)", border: "1px solid var(--border)",
              borderLeft: `4px solid ${c.colour || "var(--purple)"}`, borderRadius: "12px",
              padding: "1rem", cursor: "pointer", display: "flex", flexDirection: "column", gap: "0.25rem",
            }}>
              <span style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text)" }}>{c.name}</span>
              {c.description && (
                <span style={{ fontSize: "0.85rem", color: "var(--text-dim)", lineHeight: 1.4 }}>{c.description}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
