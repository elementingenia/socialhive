"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@/lib/UserContext"
import { VotingIcon, SpecialEventsIcon } from "@/components/NavIcons"

// Admin's single discovery entry point for hidden-by-default, occasional-use
// hubs -- Iain, 2026-09-04: "change the Voting option in Admin to Occasional
// Activities and have voting and special events housed together." Both
// Voting and Special Events are explicitly "off most of the time" by design
// (Iain's own framing for both), so this replaces Admin's old standalone
// "Voting" tile (which existed only to solve Voting's own discoverability
// gap -- see admin/page.js's SECTIONS comment) with one shared landing page
// that scales to any future feature of the same shape, instead of one
// cluttering Admin tile per hidden hub.
//
// Deliberately just a menu of links to each hub's EXISTING manage page
// (/voting/manage, /special-events/manage) rather than duplicating the
// toggle itself here -- Voting's manage page also has a Welcome Text editor
// (HubTextSection) that Special Events' deliberately doesn't ("No need for
// Page text in Admin"), so folding the toggle logic into one shared page
// would mean either building conditional per-hub content here (duplicating
// what each manage page already does) or more invasively editing Voting's
// already-merged, already-live manage screen. This page reads each hub's
// current enabled state (so the status is visible without a click) but the
// toggle action itself stays on each hub's own page.
const AREAS = [
  {
    key: "voting", label: "Voting", Icon: VotingIcon, colour: "var(--voting)",
    manageHref: "/voting/manage",
    blurb: "Elections, motions, and community decisions.",
  },
  {
    key: "special", label: "Special Events", Icon: SpecialEventsIcon, colour: "var(--special)",
    manageHref: "/special-events/manage",
    blurb: "One-off gatherings that don't fit an existing hub.",
  },
]

export default function OccasionalActivitiesPage() {
  const { member, loading } = useUser()
  const router = useRouter()
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    if (!loading && !member?.is_admin) router.replace("/home")
  }, [loading, member, router])

  useEffect(() => {
    fetch("/api/hub-settings").then(r => r.json()).then(setSettings).catch(() => setSettings({}))
  }, [])

  if (loading || !member?.is_admin) return null

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.25rem 1rem 3rem" }}>
      <button onClick={() => router.push("/admin")} style={{
        background: "none", border: "none", color: "var(--text-dim)", fontSize: "0.9rem",
        padding: 0, marginBottom: "0.75rem", cursor: "pointer",
      }}>
        ← Admin
      </button>
      <h1 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 0.25rem" }}>Occasional Activities</h1>
      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", margin: "0 0 1.25rem" }}>
        Features that stay off Home most of the time — turn each on only while it's actually in use.
      </p>

      {AREAS.map(area => {
        const enabled = !!settings?.[area.key]?.enabled
        return (
          <div key={area.key} onClick={() => router.push(area.manageHref)} style={{
            display: "flex", alignItems: "center", gap: "0.9rem",
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px",
            padding: "1rem", marginBottom: "0.75rem", cursor: "pointer",
          }}>
            <area.Icon size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: area.colour }}>{area.label}</div>
              <div style={{ color: "var(--text-dim)", fontSize: "0.82rem" }}>{area.blurb}</div>
            </div>
            <div style={{
              flexShrink: 0, fontSize: "0.78rem", fontWeight: 700, padding: "0.3rem 0.6rem", borderRadius: "999px",
              background: settings === null ? "transparent" : (enabled ? area.colour : "var(--border)"),
              color: settings === null ? "var(--text-dim)" : (enabled ? "#fff" : "var(--text-dim)"),
            }}>
              {settings === null ? "…" : (enabled ? "On" : "Off")}
            </div>
          </div>
        )
      })}
    </div>
  )
}
