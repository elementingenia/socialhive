"use client"
import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useUser } from "@/lib/UserContext"
import { useUI }   from "@/lib/UIContext"
import { getModuleColour, getPageTitle, BACK_ROUTES } from "@/lib/navUtils"

function getInitials(name) {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

export default function Header() {
  const { memberName, member } = useUser()
  const { openProfile, openPinModal } = useUI()
  const pathname     = usePathname()
  const router       = useRouter()
  const moduleColour = getModuleColour(pathname)
  const pageTitle    = getPageTitle(pathname)
  const backRoute    = BACK_ROUTES[pathname] || null
  const isHome       = pathname === "/home"

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [menuOpen])

  async function signOut() {
    setMenuOpen(false)
    const { supabase } = await import("@/lib/supabase")
    await supabase.auth.signOut()
    router.replace("/login")
  }

  const avatarEl = member?.avatar_url ? (
    <img src={member.avatar_url} alt="" style={{ width: 30, height: 30, borderRadius: "50%", border: "1.5px solid var(--border)", flexShrink: 0, objectFit: "cover" }} />
  ) : (
    <div style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: moduleColour, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.68rem", fontWeight: 700 }}>
      {getInitials(memberName)}
    </div>
  )

  const avatarPill = (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        onClick={() => setMenuOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "none", border: "1px solid var(--border)", borderRadius: "20px", padding: "3px 10px 3px 4px", cursor: "pointer", fontFamily: "inherit" }}
        aria-label="Account menu" aria-expanded={menuOpen}
      >
        {avatarEl}
        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis" }}>
          {memberName?.split(" ")[0] || "…"}
        </span>
        <span style={{ fontSize: "0.6rem", color: "var(--text-dim)", marginLeft: 1 }}>▾</span>
      </button>

      {menuOpen && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", minWidth: 170, zIndex: 300, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", overflow: "hidden" }}>
          {[
            { label: "Update Profile", action: () => { setMenuOpen(false); openProfile() } },
            { label: "Change PIN",     action: () => { setMenuOpen(false); openPinModal() } },
            { label: "Sign Out",       action: signOut, danger: true },
          ].map(item => (
            <button key={item.label} onClick={item.action} style={{ display: "block", width: "100%", textAlign: "left", padding: "0.75rem 1rem", background: "none", border: "none", cursor: "pointer", fontSize: "0.88rem", fontFamily: "inherit", color: item.danger ? "#e53e3e" : "var(--text)", borderTop: item.danger ? "1px solid var(--border)" : "none" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg)"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >{item.label}</button>
          ))}
        </div>
      )}
    </div>
  )

  const helpBtn = (
    <a href="/help" aria-label="Help" style={{ width: 30, height: 30, borderRadius: "50%", border: "1.5px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontWeight: 800, fontSize: "0.8rem", textDecoration: "none", lineHeight: 1, flexShrink: 0 }}>?</a>
  )

  // ── HOME — larger branded header ──
  if (isHome) {
    return (
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "var(--surface)", borderBottom: "3px solid " + moduleColour, padding: "0.6rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 1px 8px rgba(0,0,0,0.07)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <img src="/logo_hex_bee.png" alt="The Social Hive" style={{ width: 46, height: 46, flexShrink: 0 }} />
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.14em", color: moduleColour, textTransform: "uppercase" }}>The</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 900, letterSpacing: "0.07em", color: moduleColour, textTransform: "uppercase" }}>Social Hive</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
          {helpBtn}
          {avatarPill}
        </div>
      </header>
    )
  }

  // ── Sub-pages — compact single row ──
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, background: "var(--surface)", borderBottom: "3px solid " + moduleColour, padding: "0.45rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", boxShadow: "0 1px 8px rgba(0,0,0,0.07)" }}>
      {backRoute ? (
        <button onClick={() => router.push(backRoute.to)} style={{ display: "flex", alignItems: "center", gap: "0.3rem", background: "none", border: "none", cursor: "pointer", color: moduleColour, fontWeight: 700, fontSize: "0.88rem", padding: "0.25rem 0", flexShrink: 0 }}>
          <span style={{ fontSize: "1.1rem", lineHeight: 1 }}>←</span>
          <span>{backRoute.label}</span>
        </button>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
          <img src="/logo_hex_bee.png" alt="" style={{ width: 26, height: 26 }} />
          <div style={{ fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.06em", color: moduleColour, textTransform: "uppercase" }}>Social Hive</div>
        </div>
      )}

      {pageTitle && (
        <div style={{ fontSize: "0.95rem", fontWeight: 700, color: moduleColour, flexShrink: 0 }}>{pageTitle}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
        {helpBtn}
        {avatarPill}
      </div>
    </header>
  )
}
