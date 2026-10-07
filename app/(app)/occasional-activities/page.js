"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@/lib/UserContext"
import { authedFetch } from "@/lib/getAuthToken"
import { VotingIcon, SpecialEventsIcon, SurveysIcon, HappeningsNewsIcon, SwapIcon, MoviesIcon } from "@/components/NavIcons"

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
  {
    key: "surveys", label: "Surveys", Icon: SurveysIcon, colour: "var(--surveys)",
    manageHref: "/surveys/manage",
    blurb: "Question bank, and the show/hide toggle for the Surveys hub.",
  },
  {
    key: "happenings_news", label: "Happenings News", Icon: HappeningsNewsIcon, colour: "var(--happenings-news)",
    manageHref: "/happenings-news/manage",
    blurb: "Coordinator recaps of past events, and the archive-delay setting.",
  },
  {
    key: "swap", label: "Swap & Sell", Icon: SwapIcon, colour: "var(--swap)",
    manageHref: "/swap/manage",
    blurb: "Residents selling, giving away or asking for things. Listing cap, reports and blocks.",
  },
]

export default function OccasionalActivitiesPage() {
  const { member, loading } = useUser()
  const router = useRouter()
  const [settings, setSettings] = useState(null)
  const [digestSaving, setDigestSaving] = useState(false)
  const [digestError, setDigestError] = useState(null)
  const [stSaving, setStSaving] = useState(false)
  const [stError, setStError] = useState(null)

  useEffect(() => {
    if (!loading && !member?.is_admin) router.replace("/home")
  }, [loading, member, router])

  useEffect(() => {
    fetch("/api/hub-settings").then(r => r.json()).then(setSettings).catch(() => setSettings({}))
  }, [])

  if (loading || !member?.is_admin) return null

  // Weekly Digest master switch (Iain, 2026-10-02). Unlike the areas above
  // it has no hub or manage page of its own, so the switch lives right here.
  // Admin-only server-side too (PATCH /api/hub-settings `enabled`).
  // No row yet (migration 118 not run) reads as Off -- same as the cron.
  const digestOn = !!settings?.weekly_digest?.enabled
  // Audience (Iain, 2026-10-02): keep it in-house first, open up later.
  const digestAudience = settings?.weekly_digest?.audience === "community" ? "community" : "admins"
  async function setAudience(next) {
    if (next === digestAudience) return
    setDigestSaving(true); setDigestError(null)
    try {
      const res = await authedFetch("/api/hub-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hub_type: "weekly_digest", digest_audience: next }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || "Couldn't change who gets the digest")
      }
      setSettings(s => ({ ...(s || {}), weekly_digest: { ...(s?.weekly_digest || {}), audience: next } }))
    } catch (err) {
      setDigestError(err.message)
    } finally {
      setDigestSaving(false)
    }
  }
  async function toggleDigest() {
    setDigestSaving(true); setDigestError(null)
    try {
      const res = await authedFetch("/api/hub-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hub_type: "weekly_digest", enabled: !digestOn }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || "Couldn't change the digest setting")
      }
      setSettings(s => ({ ...(s || {}), weekly_digest: { ...(s?.weekly_digest || {}), enabled: !digestOn } }))
    } catch (err) {
      setDigestError(err.message)
    } finally {
      setDigestSaving(false)
    }
  }

  // Show Time: residents add showings (migration 131, Iain 2026-10-07).
  // Like the digest it has no manage page, so the switch lives here. While
  // off, admins and Show Time Owners can still use the wizard to trial it.
  const residentShowingsOn = !!settings?.showtime_resident_events?.enabled
  async function toggleResidentShowings() {
    setStSaving(true); setStError(null)
    try {
      const res = await authedFetch("/api/hub-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hub_type: "showtime_resident_events", enabled: !residentShowingsOn }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || "Couldn't change the setting")
      }
      setSettings(s => ({ ...(s || {}), showtime_resident_events: { ...(s?.showtime_resident_events || {}), enabled: !residentShowingsOn } }))
    } catch (err) {
      setStError(err.message)
    } finally {
      setStSaving(false)
    }
  }

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

      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px",
        padding: "1rem", marginBottom: "0.75rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
          <div style={{ fontSize: 28, lineHeight: 1, width: 32, textAlign: "center" }} aria-hidden>🗞️</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: "var(--teal)" }}>Weekly Digest</div>
            <div style={{ color: "var(--text-dim)", fontSize: "0.82rem" }}>
              Sunday afternoon round-up of what's on. Turn it on, then choose who gets it.
            </div>
          </div>
          <button type="button" role="switch" aria-checked={digestOn} aria-label="Weekly Digest on or off"
            disabled={settings === null || digestSaving} onClick={toggleDigest}
            style={{
              flexShrink: 0, width: 50, height: 28, borderRadius: 14, border: "none", position: "relative",
              background: digestOn ? "var(--teal)" : "var(--border)", cursor: "pointer",
              opacity: settings === null || digestSaving ? 0.6 : 1, transition: "background 0.2s",
            }}>
            <span style={{
              position: "absolute", top: 3, left: digestOn ? 25 : 3, width: 22, height: 22, borderRadius: "50%",
              background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)", transition: "left 0.2s",
            }} />
          </button>
        </div>
        <div style={{ marginTop: "0.8rem" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.35rem" }}>Who gets it</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[["admins", "Admins only"], ["community", "Community wide"]].map(([key, label]) => {
              const active = digestAudience === key
              return (
                <button key={key} type="button" onClick={() => setAudience(key)}
                  disabled={settings === null || digestSaving} aria-pressed={active}
                  style={{
                    flex: 1, padding: "0.55rem 0.5rem", borderRadius: 10, fontFamily: "inherit",
                    fontSize: "0.88rem", fontWeight: 700, cursor: "pointer",
                    border: `1px solid ${active ? "var(--teal)" : "var(--border)"}`,
                    background: active ? "var(--teal)" : "var(--surface)",
                    color: active ? "#fff" : "var(--text-dim)",
                    opacity: settings === null || digestSaving ? 0.6 : 1,
                  }}>
                  {label}
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.35rem" }}>
            {digestAudience === "admins"
              ? "Only admins receive it — use this to trial it before opening up."
              : "Every resident receives it, unless they've turned it off in their Profile."}
          </div>
        </div>
        {digestError && <div style={{ color: "var(--danger)", fontSize: "0.82rem", marginTop: "0.5rem" }}>{digestError}</div>}
      </div>

      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px",
        padding: "1rem", marginBottom: "0.75rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
          <MoviesIcon size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: "var(--teal)" }}>Show Time: residents add showings</div>
            <div style={{ color: "var(--text-dim)", fontSize: "0.82rem" }}>
              {residentShowingsOn
                ? "Any resident can add a showing in Show Time › Scheduled."
                : "Off: only admins and Show Time Owners can add showings (use this to trial it)."}
            </div>
          </div>
          <button type="button" role="switch" aria-checked={residentShowingsOn} aria-label="Residents add showings on or off"
            disabled={settings === null || stSaving} onClick={toggleResidentShowings}
            style={{
              flexShrink: 0, width: 50, height: 28, borderRadius: 14, border: "none", position: "relative",
              background: residentShowingsOn ? "var(--teal)" : "var(--border)", cursor: "pointer",
              opacity: settings === null || stSaving ? 0.6 : 1, transition: "background 0.2s",
            }}>
            <span style={{
              position: "absolute", top: 3, left: residentShowingsOn ? 25 : 3, width: 22, height: 22, borderRadius: "50%",
              background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)", transition: "left 0.2s",
            }} />
          </button>
        </div>
        {stError && <div style={{ color: "var(--danger)", fontSize: "0.82rem", marginTop: "0.5rem" }}>{stError}</div>}
      </div>

      {AREAS.map(area => {
        // happenings_news is the one area here with two independent
        // switches (Preview `enabled` / Production `production_enabled`)
        // instead of one -- the status pill reads the env-resolved `live`
        // field (see app/api/hub-settings/route.js) rather than raw
        // `enabled`, so this pill matches what residents in THIS
        // deployment actually see, not just the Preview flag.
        const enabled = (area.key === "happenings_news" || area.key === "swap")
          ? !!settings?.[area.key]?.live
          : !!settings?.[area.key]?.enabled
        return (
          <div key={area.key} onClick={() => router.push(`${area.manageHref}?from=occasional`)} style={{
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
