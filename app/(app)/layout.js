"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { UserProvider } from "@/lib/UserContext"
import BottomNav from "@/components/BottomNav"
import Header from "@/components/Header"

const INACTIVITY_DAYS = 14
const INACTIVITY_MS   = INACTIVITY_DAYS * 24 * 60 * 60 * 1000

export default function AppLayout({ children }) {
  const router  = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace("/login"); return }

      // Check inactivity — fetch last_active_at for this member
      const { data: member } = await supabase
        .from("members")
        .select("id, last_active_at")
        .eq("auth_id", session.user.id)
        .single()

      if (member) {
        const lastActive = member.last_active_at ? new Date(member.last_active_at) : null
        const now = new Date()

        if (lastActive && now - lastActive > INACTIVITY_MS) {
          // Inactive for more than 14 days — sign out and redirect
          await supabase.auth.signOut()
          router.replace("/login?reason=inactive")
          return
        }

        // Still active — update last_active_at (throttled: only if >5 min since last update)
        const fiveMin = 5 * 60 * 1000
        if (!lastActive || now - lastActive > fiveMin) {
          await supabase
            .from("members")
            .update({ last_active_at: now.toISOString() })
            .eq("id", member.id)
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
      <div style={{ paddingBottom: 70 }}>
        <Header />
        {children}
        <BottomNav />
      </div>
    </UserProvider>
  )
}
