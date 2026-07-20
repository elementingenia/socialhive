"use client"
import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useUser } from "@/lib/UserContext"
import { useUI }   from "@/lib/UIContext"
import { getModuleColour, getPageTitle } from "@/lib/navUtils"
import { useActiveClub } from "@/lib/useActiveClub"

function BellIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}

function QuestionIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      <path d="M9.6 9a2.4 2.4 0 0 1 4.7.6c0 1.6-2.4 2.4-2.4 2.4"/>
      <line x1="12" y1="16" x2="12" y2="16"/>
    </svg>
  )
}

function getInitials(name) {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

export default function Header() {
  const { memberName, member } = useUser()
  const { openProfile, openPinModal, openNotif, notifCount, refreshNotifCount, questionCount, refreshQuestionCount } = useUI()
  const pathname     = usePathname()
  const router       = useRouter()
  // Inside a club, the chrome takes that club's own colour/name so Clubs match
  // the other hubs' behaviour (Iain 2026-07-18 — colour standards).
  const activeClub   = useActiveClub()
  const moduleColour = activeClub?.colour || getModuleColour(pathname)
  const pageTitle    = getPageTitle(pathname) || activeClub?.name || ""
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

  useEffect(() => { refreshNotifCount() }, [refreshNotifCount])
  useEffect(() => { refreshQuestionCount() }, [refreshQuestionCount])

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

  const questionBtn = (
    <button onClick={() => router.push("/questions")} aria-label="Questions" style={{ position: "relative", width: 30, height: 30, borderRadius: "50%", border: `1.5px solid ${questionCount > 0 ? "var(--amber-dark)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", color: questionCount > 0 ? "var(--amber-dark)" : "var(--text-dim)", background: "none", cursor: "pointer", flexShrink: 0 }}>
      <QuestionIcon size={16} />
      {questionCount > 0 && (
        <span style={{ position: "absolute", top: -3, right: -3, minWidth: 16, height: 16, borderRadius: "50%", background: "var(--amber-dark)", color: "#fff", fontSize: "0.6rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", lineHeight: 1 }}>
          {questionCount > 9 ? "9+" : questionCount}
        </span>
      )}
    </button>
  )

  const bellBtn = notifCount > 0 ? (
    <button onClick={openNotif} aria-label="Notifications" style={{ position: "relative", width: 30, height: 30, borderRadius: "50%", border: "1.5px solid #e53e3e", display: "flex", alignItems: "center", justifyContent: "center", color: "#e53e3e", background: "none", cursor: "pointer", flexShrink: 0 }}>
      <BellIcon size={16} />
      <span style={{ position: "absolute", top: -3, right: -3, minWidth: 16, height: 16, borderRadius: "50%", background: "#e53e3e", color: "#fff", fontSize: "0.6rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", lineHeight: 1 }}>
        {notifCount > 9 ? "9+" : notifCount}
      </span>
    </button>
  ) : null

  const helpBtn = (
    <a href="/help-guide" target="_blank" rel="noopener noreferrer" aria-label="Help" style={{ width: 30, height: 30, borderRadius: "50%", border: "1.5px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontWeight: 800, fontSize: "0.8rem", textDecoration: "none", lineHeight: 1, flexShrink: 0 }}>?</a>
  )

  // ── HOME — larger branded header ──
  if (isHome) {
    return (
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "var(--surface)", borderBottom: "3px solid " + moduleColour, padding: "0.6rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 1px 8px rgba(0,0,0,0.07)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", minWidth: 0, overflow: "hidden" }}>
          <img src="/logo_hex_bee.png" alt="The Social Hive" style={{ width: 46, height: 46, flexShrink: 0 }} />
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.14em", color: "var(--amber)", textTransform: "uppercase" }}>The</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 900, letterSpacing: "0.07em", color: "var(--amber)", textTransform: "uppercase" }}>Social Hive</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexShrink: 0 }}>
          {questionBtn}
          {bellBtn}
          {helpBtn}
          {avatarPill}
        </div>
      </header>
    )
  }

  // ── Sub-pages — always show full wordmark logo linking to /home ──
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, background: "var(--surface)", borderBottom: "3px solid " + moduleColour, padding: "0.45rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", boxShadow: "0 1px 8px rgba(0,0,0,0.07)" }}>
      <a href="/home" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none", flexShrink: 0 }}>
        <img src="/logo_hex_bee.png" alt="The Social Hive" style={{ width: 30, height: 30, flexShrink: 0 }} />
        <div style={{ lineHeight: 1 }}>
          <div style={{ fontSize: "0.4rem", fontWeight: 700, letterSpacing: "0.14em", color: "var(--amber)", textTransform: "uppercase" }}>The</div>
          <div style={{ fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.07em", color: "var(--amber)", textTransform: "uppercase" }}>Social Hive</div>
        </div>
      </a>

      {pageTitle && (
        <div style={{ fontSize: "0.95rem", fontWeight: 700, color: moduleColour, flex: 1, minWidth: 0, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 0.25rem" }}>{pageTitle}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexShrink: 0 }}>
        {questionBtn}
        {bellBtn}
        {helpBtn}
        {avatarPill}
      </div>
    </header>
  )
}
