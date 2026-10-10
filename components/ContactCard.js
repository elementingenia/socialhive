"use client"
// Contact card, shared by Info › Contacts and My Stuff (Iain, 2026-10-10:
// people in My Stuff "can be expanded as they can on the Contacts page").
// Moved here unchanged from app/(app)/info/contacts/page.js, plus the 📌 Pin
// button (pinned / onTogglePin -- My Stuff, migration 136).
import { useState, useEffect } from "react"
import { COLOUR } from "@/components/ResidentEditPanel"
import { interestsLine } from "@/lib/interests"
import PhoneActions from "@/components/PhoneActions"
import PinButton from "@/components/PinButton"
import { formatAddress } from "@/lib/address"

// ── Contact card ─────────────────────────────────────────────────────────────
// Compact by design (Iain, 2026-07-12) -- this list is headed toward 200+
// entries as the community scales, so each tile is a single scan-able line
// (name + house #) by default. A "More" toggle appears for EVERYONE
// whenever a contact actually has title/phone/email beyond what's already
// on the compact line -- admins additionally get "Edit" alongside it, since
// viewing details and editing them are different actions (2026-07-12,
// clarified same day: Edit alone isn't a substitute for a quick "More").
export default function ContactCard({ contact, badges = [], external = false, isResident = true, onEdit, query = "", pinned, onTogglePin }) {
  // Title/Role is always visible under the name now (Iain, 2026-09-16) --
  // it's identity information (who this person is), not contact detail
  // like phone/email, so it no longer waits behind "More". "More" now only
  // ever reveals phone/email -- hasMore is scoped to those two alone.
  // Interests and skills also live behind "More" (Iain, 2026-10-03: only in
  // the expanded view), so a card with either gets the toggle too.
  const hasMore = !!(contact.phone || contact.email || contact.interests?.length || contact.skills?.length)
  // External contacts open with their details already showing. They can't be
  // messaged in the app, so the useful thing is their phone/email -- burying
  // it behind "More" would make a dimmed card a dead end (scope §7).
  const [expanded, setExpanded] = useState(external && hasMore)
  // A search that matched one of this card's interests/skills opens it, so
  // the reason it matched is visible (those lines live behind "More").
  const q = query.trim().toLowerCase()
  const matchesChip = q.length > 0 && [...(contact.interests || []), ...(contact.skills || [])]
    .some(l => l.toLowerCase().includes(q))
  useEffect(() => { if (matchesChip) setExpanded(true) }, [matchesChip])
  const isAdminView = !!onEdit

  return (
    <div style={{
      background: external ? "rgba(138,143,107,0.10)" : "var(--surface)", borderRadius: 10,
      border: "1px solid var(--border)",
      borderLeft: external ? "3px solid rgba(138,143,107,0.55)" : "1px solid var(--border)",
      padding: "0.55rem 0.8rem",
      marginBottom: "0.4rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
        <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: "0.4rem", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text)" }}>{contact.name}</span>
          {isResident && (contact.house_number || contact.street_name) && (
            <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>· {formatAddress(contact.house_number, contact.street_name)}</span>
          )}
          {badges.map(b => (
            <span key={b} style={{
              fontSize: "0.6rem", fontWeight: 700, padding: "0.05rem 0.4rem",
              borderRadius: 10, background: "var(--surface2)", color: "var(--text-dim)",
            }}>{b}</span>
          ))}
          {/* Colour is never the only signal -- this label carries the meaning
              for colour-vision-deficient and screen-reader users. The contact
              NAME stays full-strength var(--text); only the container is
              tinted, because dimming text on an aging-eyes app would be a
              legibility regression. */}
          {external && (
            <span style={{
              fontSize: "0.6rem", fontWeight: 700, padding: "0.05rem 0.4rem",
              borderRadius: 10, background: "rgba(138,143,107,0.18)", color: "var(--external-ink)",
            }}>External</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
          {onTogglePin && <PinButton pinned={!!pinned} onToggle={onTogglePin} label={contact.name} />}
          {hasMore && (
            <button onClick={() => setExpanded(v => !v)} style={{
              flexShrink: 0, fontSize: "0.7rem", fontWeight: 700, color: COLOUR,
              background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0,
            }}>{expanded ? "Less ▲" : "More ▼"}</button>
          )}
          {isAdminView && (
            <button onClick={onEdit} style={{
              flexShrink: 0, fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.55rem", borderRadius: 6,
              border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
              cursor: "pointer", fontFamily: "inherit",
            }}>Edit</button>
          )}
        </div>
      </div>
      {contact.title && (
        // Distinct colour from the realName line below (Iain, 2026-09-16):
        // both used to be var(--text-dim), and since Title/Role became
        // always-visible (not gated behind "More") they were reading as
        // the same line twice. --role-accent is a bronze, deliberately not
        // the page's own blue (COLOUR, used for phone/email/"More") and not
        // any hub colour -- see app/globals.css for the contrast check.
        <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--role-accent)", marginTop: "0.15rem" }}>
          {contact.title}
        </div>
      )}
      {contact.realName && (
        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "0.15rem" }}>
          {contact.realName}
        </div>
      )}
      {expanded && (
        <div style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          {/* "Can help with" (skills, B7) and "Ask me about" (interests, B3):
              expanded view only (Iain, 2026-10-03). Approved chips only, never
              for a Private resident -- enforced server-side by
              /api/interests/directory. Nothing rendered when empty. */}
          {contact.skills?.length > 0 && (
            <div style={{ fontSize: "0.8rem", color: "var(--text)", lineHeight: 1.35 }}>
              <span style={{ color: "var(--text-dim)" }}>Can help with: </span>{interestsLine(contact.skills)}
            </div>
          )}
          {contact.interests?.length > 0 && (
            <div style={{ fontSize: "0.8rem", color: "var(--text)", lineHeight: 1.35 }}>
              <span style={{ color: "var(--text-dim)" }}>Ask me about: </span>{interestsLine(contact.interests)}
            </div>
          )}
          {contact.phone && <PhoneActions phone={contact.phone} colour={COLOUR} />}
          {contact.email && (
            <a href={`mailto:${contact.email}`} style={{ fontSize: "0.85rem", color: COLOUR, textDecoration: "none", fontWeight: 600 }}>
              ✉ {contact.email}
            </a>
          )}
        </div>
      )}
    </div>
  )
}
