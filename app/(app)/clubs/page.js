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
  const { myClubIds } = useMyClubs()
  const [scope, setScope] = useState("mine") // "mine" | "all"

  useEffect(() => {
    supabase.from("clubs").select("id, name, slug, description, colour")
      .eq("archived", false).order("sort_order").order("name")
      .then(({ data }) => setClubs(data || []))
  }, [])

  // BUG-049 (2026-09-10): this used to silently swap "My Groups & Clubs" for
  // "All" the moment joinedCount was 0, while the "My Groups & Clubs" pill
  // stayed visually selected — so a member with zero joins saw every club
  // listed under a pill that claimed to be scoped to their own. Reported by
  // Iain: "The My Groups and Clubs and All are not working as they should.
  // The view in My Groups and Clubs included clubs I have not joined."
  // Confirmed via a direct query against production club_members: Iain
  // genuinely has 0 rows there, so the data was correct — the fallback was
  // the bug. Removed per Iain's explicit choice (option 1): "mine" now
  // always means "mine", even when that's empty; the existing empty state
  // below already offers a "See all groups & clubs →" link for that case.
  const shown = useMemo(() => {
    if (!clubs) return null
    return scope === "mine" ? clubs.filter(c => myClubIds.has(c.id)) : clubs
  }, [clubs, scope, myClubIds])

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
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text)", margin: 0 }}>Groups & Clubs</h1>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {pill("mine", "My Groups & Clubs")}
        {pill("all", "All Groups & Clubs")}
      </div>

      {shown === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}><div className="spinner" /></div>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-dim)" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🐝</div>
          {scope === "mine"
            ? <>You haven&apos;t joined any groups or clubs yet. <button onClick={() => setScope("all")} style={{ background: "none", border: "none", color: "var(--purple)", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>See all groups &amp; clubs →</button></>
            : "No groups or clubs yet. An admin can add one from Admin > Groups & Clubs."}
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
