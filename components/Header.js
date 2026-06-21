"use client"
import { usePathname, useRouter } from "next/navigation"
import { useUser } from "@/lib/UserContext"
import { getModuleColour, getPageTitle, BACK_ROUTES } from "@/lib/navUtils"

export default function Header() {
  const { memberName } = useUser()
  const pathname       = usePathname()
  const router         = useRouter()
  const moduleColour   = getModuleColour(pathname)
  const pageTitle      = getPageTitle(pathname)
  const backRoute      = BACK_ROUTES[pathname] || null

  async function signOut() {
    const { supabase } = await import("@/lib/supabase")
    await supabase.auth.signOut()
    router.replace("/login")
  }

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "var(--surface)",
      borderBottom: "3px solid " + moduleColour,
      padding: "0.5rem 1rem",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      boxShadow: "0 1px 8px rgba(0,0,0,0.07)",
    }}>

      {/* Left: back button OR logo */}
      {backRoute ? (
        <button
          onClick={() => router.push(backRoute.to)}
          style={{
            display: "flex", alignItems: "center", gap: "0.3rem",
            background: "none", border: "none", cursor: "pointer",
            color: moduleColour, fontWeight: 700, fontSize: "0.88rem",
            padding: "0.25rem 0", minWidth: 0, flexShrink: 0,
          }}
        >
          <span style={{ fontSize: "1.1rem", lineHeight: 1 }}>←</span>
          <span>{backRoute.label}</span>
        </button>
      ) : (
        <button
          onClick={() => router.push("/profile")}
          style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
            minWidth: 0, background: "none", border: "none",
            cursor: "pointer", padding: 0, textAlign: "left",
          }}
        >
          <img
            src="/logo_hex_bee.png"
            alt="The Social Hive"
            style={{ width: 36, height: 36, flexShrink: 0 }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.1em",
              color: moduleColour, textTransform: "uppercase", lineHeight: 1,
              whiteSpace: "nowrap",
            }}>The Social Hive</div>
            <div style={{
              fontSize: "0.72rem", color: "var(--text-dim)", lineHeight: 1.2,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {memberName ? "Welcome, " + memberName : "…"}
            </div>
          </div>
        </button>
      )}

      {/* Centre: page title */}
      <div style={{
        fontSize: "0.95rem", fontWeight: 700,
        color: moduleColour,
        letterSpacing: "0.01em",
        flexShrink: 0,
      }}>{pageTitle}</div>

      {/* Right: help + sign out */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
        <a
          href="/help"
          aria-label="Help"
          style={{
            width: 30, height: 30, borderRadius: "50%",
            border: "2px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-dim)", fontWeight: 800, fontSize: "0.82rem",
            textDecoration: "none", lineHeight: 1, flexShrink: 0,
          }}
        >?</a>
        <button
          onClick={signOut}
          style={{
            background: "none", border: "1px solid var(--border)", borderRadius: "8px",
            padding: "0.3rem 0.65rem", fontSize: "0.76rem", color: "var(--text-dim)",
            cursor: "pointer", fontWeight: 500, fontFamily: "inherit", whiteSpace: "nowrap",
          }}
        >Sign out</button>
      </div>
    </header>
  )
}
