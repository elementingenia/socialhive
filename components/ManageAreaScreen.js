"use client"
import { useUser } from "@/lib/UserContext"
import { useOwners } from "@/lib/useOwners"
import { useRouter } from "next/navigation"

// Shared access gate + breadcrumb chrome for an Owner's "Manage this area"
// screen (Owner_SelfService_and_Library_Hub_Scope_v1, Part A.3). Deliberately
// NOT part of Admin's route or its blanket is_admin gate (Admin's tab bar
// covers six-plus unrelated sections with no per-area scoping — see the
// scope doc's A.3 for why that path was rejected). Reached only via a link
// on the area's own page, gated admin-or-this-area's-Owner via the same
// space_owners primitive lib/areaAuth.js checks server-side on every write
// this screen's children (HubTextSection, ClubForm) actually trigger — this
// client-side check is a UX gate, not the security boundary.
export default function ManageAreaScreen({ contextType, contextKey, backHref, backLabel, title, colour = "var(--teal)", children }) {
  const router = useRouter()
  const { member, isAdmin, loading: userLoading } = useUser()
  const { owners, loading: ownersLoading } = useOwners(contextType, contextKey)
  const isOwner = !!member?.id && owners.some(o => o.id === member.id)
  const canManage = isAdmin || isOwner
  const loading = userLoading || ownersLoading

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}><div className="spinner" /></div>
  }

  if (!canManage) {
    return (
      <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--text-dim)" }}>
        You don&apos;t have access to manage this area.
        <div style={{ marginTop: "1rem" }}>
          <button onClick={() => router.push(backHref)}
            style={{ background: colour, color: "#fff", border: "none", borderRadius: 10,
              padding: "0.6rem 1.2rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            ← {backLabel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: "0 1rem 6rem" }}>
      <button onClick={() => router.push(backHref)}
        style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "none", border: "none",
          color: colour, fontWeight: 600, fontSize: "0.88rem", cursor: "pointer", padding: "1rem 0", fontFamily: "inherit" }}>
        ← {backLabel}
      </button>
      <h1 style={{ fontSize: "1.15rem", fontWeight: 800, margin: "0 0 1rem", color: "var(--text)" }}>{title}</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {children}
      </div>
    </div>
  )
}
