"use client"
import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import ManageAreaScreen from "@/components/ManageAreaScreen"
import ClubForm from "@/components/ClubForm"

// Owner self-service "Manage this club" screen (Owner_SelfService_and_
// Library_Hub_Scope_v1, Part A.3) — the same ClubForm Admin > Groups & Clubs
// uses, rendered standalone with showOwners=false (A.4: an Owner cannot
// manage their own area's Owner list, that stays admin-only). Edits go
// through PATCH /api/clubs/settings, which re-checks admin-or-this-club's-
// Owner server-side — this page's gate (ManageAreaScreen) is a UX
// convenience, not the real boundary.
export default function ClubManagePage() {
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
        This club couldn&apos;t be found.
      </div>
    )
  }

  return (
    <ManageAreaScreen contextType="club" contextKey={club.id} backHref={`/clubs/${slug}`}
      backLabel={club.name} title={`Manage ${club.name}`} colour={club.colour || "var(--purple)"}>
      <ClubForm
        club={club}
        showOwners={false}
        onSaved={() => router.push(`/clubs/${slug}`)}
        onCancel={() => router.push(`/clubs/${slug}`)}
      />
    </ManageAreaScreen>
  )
}
