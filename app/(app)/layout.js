"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { UserProvider } from "@/lib/UserContext"
import BottomNav from "@/components/BottomNav"
import Header from "@/components/Header"

export default function AppLayout({ children }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace("/login")
      else setReady(true)
    })
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
