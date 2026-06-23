"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { UserProvider, useUser } from "@/lib/UserContext"
import { UIProvider, useUI } from "@/lib/UIContext"
import BottomNav from "@/components/BottomNav"
import Header from "@/components/Header"
import ProfileSlideOver from "@/components/ProfileSlideOver"

const INACTIVITY_DAYS = 14
const INACTIVITY_MS   = INACTIVITY_DAYS * 24 * 60 * 60 * 1000
const POST_REG_KEY    = "shive_profile_nudge_dismissed"

// Inner layout — has access to UserContext and UIContext
function InnerLayout({ children }) {
  const { member, refreshUser } = useUser()
  const { profileOpen, openProfile, closeProfile } = useUI()
  const [showNudge, setShowNudge] = useState(false)

  // Post-registration profile nudge: show once if email is unset and not dismissed
  useEffect(() => {
    if (!member) return
    const dismissed = sessionStorage.getItem(POST_REG_KEY)
    if (!dismissed && !member.email) {
      // Small delay so page settles first
      const t = setTimeout(() => setShowNudge(true), 1200)
      return () => clearTimeout(t)
    }
  }, [member])

  function dismissNudge() {
    sessionStorage.setItem(POST_REG_KEY, "1")
    setShowNudge(false)
  }

  function openProfileFromNudge() {
    dismissNudge()
    openProfile()
  }

  return (
    <div style={{ paddingBottom: 70 }}>
      <Header />
      {children}
      <BottomNav />

      <ProfileSlideOver
        open={profileOpen}
        onClose={closeProfile}
        onSaved={(data) => {
          refreshUser()
          closeProfile()
        }}
      />

      {/* Post-registration profile nudge */}
      {showNudge && (
        <>
          <div
            onClick={dismissNudge}
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
              zIndex: 300, backdropFilter: "blur(2px)",
            }}
          />
          <div style={{
            position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)",
            width: "min(360px, calc(100vw - 2rem))",
            background: "var(--surface)", borderRadius: "16px",
            padding: "1.5rem 1.25rem", zIndex: 301,
            boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>👋</div>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text)", marginBottom: "0.4rem" }}>
              Personalise your profile
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: "1.25rem", lineHeight: 1.5 }}>
              Add your house number, choose an avatar, and set your preferences — it only takes a moment.
            </div>
            <button
              onClick={openProfileFromNudge}
              style={{
                width: "100%", padding: "0.8rem",
                background: "var(--teal)", color: "#fff",
                border: "none", borderRadius: "10px",
                fontSize: "0.95rem", fontWeight: 700, fontFamily: "inherit",
                cursor: "pointer", marginBottom: "0.6rem",
              }}
            >Set up my profile</button>
            <button
              onClick={dismissNudge}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: "0.82rem", color: "var(--text-dim)", fontFamily: "inherit",
              }}
            >Maybe later</button>
          </div>
        </>
      )}
    </div>
  )
}

export default function AppLayout({ children }) {
  const router  = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace("/login"); return }

      const { data: member } = await supabase
        .from("members")
        .select("id, last_active_at")
        .eq("auth_id", session.user.id)
        .single()

      if (member) {
        const lastActive = member.last_active_at ? new Date(member.last_active_at) : null
        const now = new Date()
        if (lastActive && now - lastActive > INACTIVITY_MS) {
          await supabase.auth.signOut()
          router.replace("/login?reason=inactive")
          return
        }
        const fiveMin = 5 * 60 * 1000
        if (!lastActive || now - lastActive > fiveMin) {
          await supabase.from("members").update({ last_active_at: now.toISOString() }).eq("id", member.id)
        }
      }

      setReady(true)
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) router.replace("/login")
    })
    return () => subscription.unsubscribe()
  }, [router])

  if (!ready) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div className="spinner" />
    </div>
  )

  return (
    <UserProvider>
      <UIProvider>
        <InnerLayout>{children}</InnerLayout>
      </UIProvider>
    </UserProvider>
  )
}
