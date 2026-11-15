"use client"
import { useUser } from "@/lib/UserContext"
import { useOwners } from "@/lib/useOwners"
import WelcomeCardsAdmin from "@/components/WelcomeCardsAdmin"

// Sign-in Help for committee (Iain, 2026-11-16): the same screen as
// Admin > Residents > Sign-in Help, reached from the Committee page. The
// server decides what a committee member who is not an admin gets --
// residents who have never signed in, and welcome packs only
// (app/api/admin/welcome-cards). This check only keeps other residents from
// seeing an empty screen; it is not the security.
export default function CommitteeSignInHelpPage() {
  const { member, isAdmin } = useUser()
  const { owners, loading } = useOwners("hub", "committee")
  const allowed = isAdmin || (!!member?.id && owners.some(o => o.id === member.id))

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "1rem 16px 2rem" }}>
      {allowed
        ? <WelcomeCardsAdmin backHref="/committee/sign-in-help" />
        : <div style={{ fontSize: "0.9rem", color: "var(--text-dim)" }}>{loading ? "Loading…" : "Sign-in Help is for committee members and admins."}</div>}
    </div>
  )
}
