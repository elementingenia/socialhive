"use client"
import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ClubsIcon } from "@/components/NavIcons"
import { useMyClubs } from "@/lib/useMyClubs"

// Clubs hub. Defaults to the clubs you've JOINED (Iain 2026-07-18), with an
// All toggle. Each club opens the generic /clubs/[slug] page. Joining only
// controls notices, not access — anyone can open any club from "All".
export default function ClubsHome() {
  const router = useRouter()
  const [clubs, setClubs] = useState(null)
  const { myClubIds, loaded: myLoaded } = useMyClubs()
  const [scope, setScope] = useState("mine") // "mine" | "all"

  useEffect(() => {
    supabase.from("clubs").select("id, name, slug, description, colour")
      .eq("archived", false).order("sort_order").order("name")
      .then(({ data }) => setClubs(data || []))
  }, [])

  const joinedCount = useMemo(() => (clubs || []).filter(c => myClubIds.has(c.id)).length, [clubs, myClubIds])
  // If the member hasn't joined anything yet, don't strand them on an empty
  // "My clubs" — show All so there's something to see and join.
  const effectiveScope = (scope === "mine" && myLoaded && joinedCount === 0) ? "all" : scope
  const shown = useMemo(() => {
    if (!clubs) return null
    return effectiveScope === "mine" ? clubs.filter(c => myClubIds.has(c.id)) : clubs
  }, [clubs, effectiveScope, myClubIds])

  const pill = (key, label) => {
    const on = scope === key
    return (
      <button key={key} onClick={() => setScope(key)} style={{
        padding: "0.35rem 0.9rem", borderRadius: 20, fontFamily: "inherit", fontWeight: 700, fontSize: "0.82rem",
        cursor: "pointer", border: `1.5px solid ${on ? "var(--purple)" : "var(--border)"}`,
        background: on ? "var(--purple)" : "var(--surface)", color: on ? "#fff" : "var(--text-dim)",
      }}>{label}</button>
    )
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "1rem 1rem 6rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
        <span style={{ color: "var(--purple)", lineHeight: 0 }}><ClubsIcon size={30} /></span>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text)", margin: 0 }}>Clubs</h1>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {pill("mine", "My Clubs")}
        {pill("all", "All Clubs")}
      </div>

      {shown === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}><div className="spinner" /></div>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-dim)" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🐝</div>
          {effectiveScope === "mine"
            ? <>You haven&apos;t joined any clubs yet. <button onClick={() => setScope("all")} style={{ background: "none", border: "none", color: "var(--purple)", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>See all clubs →</button></>
            : "No clubs yet. An admin can add one from the Club Manager."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {shown.map(c => (
            <button key={c.id} onClick={() => router.push(`/clubs/${c.slug}`)} style={{
              textAlign: "left", background: "var(--surface)", border: "1px solid var(--border)",
              borderLeft: `4px solid ${c.colour || "var(--purple)"}`, borderRadius: "12px",
              padding: "1rem", cursor: "pointer", display: "flex", flexDirection: "column", gap: "0.25rem",
            }}>
              <span style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text)" }}>
                {c.name}
                {myClubIds.has(c.id) && <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--purple)", marginLeft: 6 }}>✓ Joined</span>}
              </span>
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
