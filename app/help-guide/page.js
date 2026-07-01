"use client"
import { useState } from "react"

const BASE = "https://tzzxwvbqszzrruxjrpcs.supabase.co/storage/v1/object/public/help-screenshots"
const IMG = (name) => `${BASE}/${name}`

const PRINT_STYLE = `
  @media print {
    .no-print { display: none !important; }
    .print-break { page-break-before: always; break-before: page; }
    body { background: #fff !important; }
    img { max-width: 260px !important; break-inside: avoid; }
    section { break-inside: avoid; page-break-inside: avoid; }
    h2 { page-break-after: avoid; break-after: avoid; }
    a { color: inherit !important; text-decoration: none !important; }
  }
`

const teal   = "#2a9d8f"
const amber  = "#e6a817"
const text   = "#2d2d2d"
const muted  = "#666"
const border = "#e2e8f0"
const bg     = "#faf8f5"

const EC_BADGE = (
  <span style={{
    display: "inline-block",
    background: teal,
    color: "#fff",
    fontSize: "0.6rem",
    fontWeight: 700,
    letterSpacing: "0.05em",
    padding: "2px 8px",
    borderRadius: 20,
    marginLeft: 8,
    verticalAlign: "middle",
    textTransform: "uppercase",
  }}>EC only</span>
)

const SECTIONS = [
  { id: "access",   num: 1, title: "Signing In, Registering & Changing Your Password" },
  { id: "profile",  num: 2, title: "Your Profile & PIN" },
  { id: "movies",   num: 3, title: "Movies — Screenings, Booking & Library" },
  { id: "social",   num: 4, title: "Social Events — Community Activities & Trips" },
  { id: "bookclub", num: 5, title: "Book Club" },
  { id: "bar",      num: 6, title: "My Bar — Honour Bar & Tab" },
  { id: "calendar", num: 7, title: "Community Calendar" },
  { id: "bookings", num: 8, title: "My Bookings" },
]

function Section({ id, num, title, children }) {
  return (
    <section id={id} style={{ marginBottom: "3rem" }}>
      <h2 style={{
        fontSize: "1.1rem",
        fontWeight: 800,
        color: teal,
        margin: "0 0 1rem",
        paddingBottom: "0.5rem",
        borderBottom: `3px solid ${teal}`,
        display: "flex",
        alignItems: "baseline",
        gap: "0.6rem",
      }}>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: teal,
          color: "#fff",
          fontSize: "0.8rem",
          fontWeight: 800,
          flexShrink: 0,
        }}>{num}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Subsection({ title, ecOnly, children }) {
  return (
    <div style={{ marginBottom: "1.75rem", paddingLeft: "0.5rem", borderLeft: `3px solid ${border}` }}>
      <h3 style={{
        fontSize: "0.9rem",
        fontWeight: 700,
        color: text,
        margin: "0 0 0.75rem",
        display: "flex",
        alignItems: "center",
      }}>
        {title}{ecOnly && EC_BADGE}
      </h3>
      {children}
    </div>
  )
}

function Step({ img, alt, children }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      {img && (
        <img
          src={img}
          alt={alt || ""}
          style={{
            width: "100%",
            maxWidth: 280,
            display: "block",
            margin: "0 auto 0.85rem",
            borderRadius: 12,
            border: `1px solid ${border}`,
            boxShadow: "0 2px 12px rgba(0,0,0,0.09)",
          }}
        />
      )}
      <p style={{ fontSize: "0.88rem", color: "#444", lineHeight: 1.65, margin: 0 }}>{children}</p>
    </div>
  )
}

export default function HelpGuidePage() {
  const [tocOpen, setTocOpen] = useState(true)

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <>
      <style>{PRINT_STYLE}</style>
      <div style={{ minHeight: "100vh", background: bg, fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", color: text }}>

        {/* ── Document header ── */}
        <header style={{
          background: `linear-gradient(135deg, ${teal} 0%, #1a7a6e 100%)`,
          color: "#fff",
          padding: "2rem 1.5rem 1.75rem",
          position: "relative",
        }}>
          {/* Print button */}
          <button
            className="no-print"
            onClick={() => window.print()}
            style={{
              position: "absolute", top: "1rem", right: "1rem",
              padding: "0.45rem 1rem",
              background: "rgba(255,255,255,0.2)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.4)",
              borderRadius: 20,
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >↓ Save as PDF</button>

          {/* Logo + title */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
            <img src="/logo_hex_bee.png" alt="" style={{ width: 52, height: 52, filter: "brightness(0) invert(1) opacity(0.9)" }} />
            <div>
              <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.18em", opacity: 0.8, textTransform: "uppercase", marginBottom: 2 }}>The Social Hive</div>
              <div style={{ fontSize: "1.6rem", fontWeight: 900, lineHeight: 1.1 }}>User Guide</div>
            </div>
          </div>

          {/* Intro */}
          <p style={{ fontSize: "0.9rem", lineHeight: 1.65, opacity: 0.92, margin: 0, maxWidth: 560 }}>
            This guide covers everything you need to use The Social Hive — from signing in for the first
            time to booking events, recording bar purchases, and browsing the community calendar.
            Sections marked <strong>EC only</strong> are for Element Communities coordinators.
          </p>
        </header>

        {/* ── Table of Contents ── */}
        <div style={{
          background: "#fff",
          borderBottom: `1px solid ${border}`,
          padding: "0",
        }}>
          {/* TOC toggle header */}
          <button
            className="no-print"
            onClick={() => setTocOpen(v => !v)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.85rem 1.25rem",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "0.85rem",
              fontWeight: 700,
              color: text,
              borderBottom: tocOpen ? `1px solid ${border}` : "none",
            }}
          >
            <span>📋 Contents</span>
            <span style={{ fontSize: "0.75rem", color: muted }}>{tocOpen ? "▲ hide" : "▼ show"}</span>
          </button>

          {/* TOC always visible for print */}
          <div style={{ display: tocOpen ? "block" : "none" }} className="toc-body">
            <ol style={{ margin: 0, padding: "0.75rem 1.25rem 1rem 2.5rem", listStyle: "decimal" }}>
              {SECTIONS.map(s => (
                <li key={s.id} style={{ marginBottom: "0.5rem" }}>
                  <button
                    className="no-print"
                    onClick={() => scrollTo(s.id)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      fontFamily: "inherit", fontSize: "0.88rem",
                      color: teal, fontWeight: 600, padding: 0,
                      textAlign: "left", textDecoration: "underline",
                      textDecorationColor: "rgba(42,157,143,0.3)",
                    }}
                  >{s.title}</button>
                  <span className="no-print" style={{ display: "none" }}>{s.title}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Print-only TOC (always visible in print) */}
          <div className="print-toc" style={{ display: "none" }}>
            <style>{`@media print { .print-toc { display: block !important; padding: 0.75rem 1.25rem 1rem 2.5rem; } .toc-body { display: block !important; } }`}</style>
          </div>
        </div>

        {/* ── Main content ── */}
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1.25rem 4rem" }}>

          {/* 1. SIGN IN & REGISTER */}
          <Section id="access" num={1} title="Signing In, Registering & Changing Your Password">
            <Subsection title="Sign In">
              <Step img={IMG("01-login.png")} alt="Sign In screen">
                Open The Social Hive and you'll arrive at the sign-in screen. Enter your
                <strong> username</strong> and <strong>password</strong>, then tap <strong>Sign In</strong>.
              </Step>
            </Subsection>
            <Subsection title="Register — first time users">
              <Step img={IMG("02-register.png")} alt="Register screen">
                Tap <strong>Register</strong> at the top of the screen. Enter the invite code provided
                by your coordinator, choose a username and password, then tap <strong>Register</strong>.
              </Step>
            </Subsection>
            <Subsection title="Change Password">
              <Step img={IMG("03-change-password.png")} alt="Change Password screen">
                Tap <strong>Change Password</strong> at the top of the sign-in screen. Enter your
                username, current password, and your new password, then confirm.
              </Step>
            </Subsection>
          </Section>

          {/* 2. PROFILE */}
          <Section id="profile" num={2} title="Your Profile & PIN">
            <Subsection title="Updating your profile">
              <Step img={IMG("05-profile.png")} alt="Profile screen">
                Tap your name or avatar in the top-right corner of any page to open the account menu.
                Select <strong>Update Profile</strong> to update your display name, email address,
                and house number.
              </Step>
            </Subsection>
            <Subsection title="Changing your PIN">
              <Step>
                From the same account menu (top-right), select <strong>Change PIN</strong>.
                Enter your current PIN, then enter and confirm your new 4-digit PIN.
                Your PIN is required when recording purchases at the community bar.
              </Step>
            </Subsection>
          </Section>

          {/* 3. MOVIES */}
          <Section id="movies" num={3} title="Movies — Screenings, Booking & Library">
            <Subsection title="Movies home">
              <Step img={IMG("06-movies.png")} alt="Movies home">
                The Movies section shows your next upcoming screening at a glance, with links to all
                scheduled events, the suggestions library, and the DVD collection.
              </Step>
            </Subsection>
            <Subsection title="Scheduled screenings">
              <Step img={IMG("07-screenings.png")} alt="Scheduled screenings">
                The Scheduled tab lists all upcoming screenings with date, time, ratings, and seat
                availability. Tap any card to open the booking panel.
              </Step>
            </Subsection>
            <Subsection title="Booking a seat">
              <Step img={IMG("10-screening-slideout.png")} alt="Booking panel">
                Inside the booking panel, tap <strong>Reserve my seat</strong> and select how many
                seats you need. If the screening is full, tap <strong>Join Waitlist</strong> — you'll
                be notified automatically if a seat becomes available.
              </Step>
            </Subsection>
            <Subsection title="Suggestions library">
              <Step img={IMG("08-library.png")} alt="Movie suggestions">
                Browse or search movies that residents have suggested for future screenings.
                Tap any title to see full details.
              </Step>
            </Subsection>
            <Subsection title="DVD library">
              <Step img={IMG("09-dvd.png")} alt="DVD library">
                Browse the community's physical DVD collection. Tap any title to suggest it for an
                upcoming screening.
              </Step>
            </Subsection>
            <Subsection title="Coordinator panel" ecOnly>
              <Step>
                ECs see a <strong>Coordinator View</strong> section inside every booking panel.
                This shows the full attendee list, seat counts, unpaid seats, and allows adding notes
                or cancelling individual bookings.
              </Step>
            </Subsection>
          </Section>

          {/* 4. SOCIAL */}
          <Section id="social" num={4} title="Social Events — Community Activities & Trips">
            <Subsection title="Social hub">
              <Step img={IMG("11-social.png")} alt="Social hub">
                The Social section lists upcoming community events — dinners, day trips, activities,
                and more.
              </Step>
            </Subsection>
            <Subsection title="Viewing and booking events">
              <Step img={IMG("12-social-events.png")} alt="Social events list">
                Tap the <strong>Scheduled</strong> tab to see all upcoming events. Tap any card to
                open the full event detail.
              </Step>
            </Subsection>
            <Subsection title="Event detail">
              <Step img={IMG("13-social-slideout.png")} alt="Event detail panel">
                The detail panel shows the event description, date, location, coordinator name, bus
                information, and available seats. Tap <strong>Reserve seats</strong> to book your place.
              </Step>
            </Subsection>
            <Subsection title="Coordinator panel" ecOnly>
              <Step>
                ECs see the full attendee list with seat counts and unpaid bookings. They can add
                notes or cancel any booking directly from the coordinator panel.
              </Step>
            </Subsection>
          </Section>

          {/* 5. BOOK CLUB */}
          <Section id="bookclub" num={5} title="Book Club">
            <Subsection title="Book Club home">
              <Step img={IMG("14-bookclub.png")} alt="Book Club home">
                The Book Club section shows the current book pick, upcoming meeting dates, and recent
                book suggestions from residents.
              </Step>
            </Subsection>
            <Subsection title="Suggesting a book">
              <Step img={IMG("15-bookclub-suggest.png")} alt="Book suggestions">
                Tap <strong>Suggestions</strong> to browse books that others have put forward, or tap
                <strong> Add suggestion</strong> to propose your own. The group votes on the next read.
              </Step>
            </Subsection>
          </Section>

          {/* 6. BAR */}
          <Section id="bar" num={6} title="My Bar — Honour Bar & Tab">
            <Subsection title="The bar menu">
              <Step img={IMG("16-bar.png")} alt="Bar home">
                The community bar operates on an honour system. Browse available drinks and current
                prices, then tap <strong>Add</strong> next to any item to record a purchase.
              </Step>
            </Subsection>
            <Subsection title="Confirming a purchase">
              <Step>
                After tapping <strong>Add</strong>, confirm the quantity and enter your 4-digit PIN
                to approve the charge. Your personal tab updates immediately.
                If you haven't set a PIN yet, do so via the account menu (top-right → Change PIN).
              </Step>
            </Subsection>
            <Subsection title="Tab reconciliation" ecOnly>
              <Step>
                ECs can view all member tabs, mark amounts as paid, and reconcile the full bar ledger
                from the Bar admin panel.
              </Step>
            </Subsection>
          </Section>

          {/* 7. CALENDAR */}
          <Section id="calendar" num={7} title="Community Calendar">
            <Step img={IMG("17-calendar.png")} alt="Community calendar">
              The Calendar brings all upcoming events together — Movies, Social, and Book Club — in
              a single view. Use the buttons at the top to switch between <strong>month</strong> and
              <strong> week</strong> view. Tap any event to open its detail panel where you can
              read more or book your place.
            </Step>
          </Section>

          {/* 8. BOOKINGS */}
          <Section id="bookings" num={8} title="My Bookings">
            <Step img={IMG("18-bookings.png")} alt="My bookings">
              My Bookings shows all your current reservations across every hub in one place.
              Use the filter tabs at the top to narrow down by Movies, Social, or Book Club.
              Tap any booking card to view the event detail or manage your seat.
            </Step>
            <Subsection title="Understanding booking status">
              <Step>
                <strong style={{ color: "#166534" }}>Confirmed</strong> — your seat is secured and
                ready.{" "}
                <strong style={{ color: "#92400e" }}>Pending Payment</strong> — payment is required
                before the event date.{" "}
                <strong style={{ color: "#64748b" }}>Waitlisted</strong> — you are on the waitlist
                and will be notified automatically if a seat opens up.
              </Step>
            </Subsection>
          </Section>

          {/* Footer */}
          <div style={{
            marginTop: "2rem",
            paddingTop: "1.5rem",
            borderTop: `1px solid ${border}`,
            textAlign: "center",
          }}>
            <img src="/logo_hex_bee.png" alt="" style={{ width: 36, height: 36, opacity: 0.4, marginBottom: "0.5rem" }} />
            <p style={{ fontSize: "0.8rem", color: muted, margin: 0, lineHeight: 1.6 }}>
              The Social Hive — Fullerton Cove Community App<br />
              Need further help? Speak to your Element Communities coordinator.
            </p>
          </div>

        </div>
      </div>
    </>
  )
}
