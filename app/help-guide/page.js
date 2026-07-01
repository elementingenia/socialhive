"use client"
import { useState } from "react"

const BASE = "https://tzzxwvbqszzrruxjrpcs.supabase.co/storage/v1/object/public/help-screenshots"
const IMG = (name) => `${BASE}/${name}`

// ── Print styles injected once ────────────────────────────────────────────────
const PRINT_STYLE = `
  @media print {
    .no-print { display: none !important; }
    body { background: #fff !important; }
    img { max-width: 280px !important; break-inside: avoid; }
    section { break-inside: avoid; page-break-inside: avoid; }
    h2 { page-break-after: avoid; break-after: avoid; }
  }
`

const EC_BADGE = (
  <span style={{
    display: "inline-block",
    background: "#2a9d8f",
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

function Section({ id, title, children }) {
  return (
    <section id={id} style={{ marginBottom: "2.5rem" }}>
      <h2 style={{
        fontSize: "1.05rem",
        fontWeight: 700,
        color: "#2a9d8f",
        margin: "0 0 1rem",
        paddingBottom: "0.4rem",
        borderBottom: "2px solid #2a9d8f",
      }}>{title}</h2>
      {children}
    </section>
  )
}

function Subsection({ title, ecOnly, children }) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <h3 style={{
        fontSize: "0.9rem",
        fontWeight: 600,
        color: "#333",
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
    <div style={{ marginBottom: "1.25rem" }}>
      {img && (
        <img
          src={img}
          alt={alt || ""}
          style={{
            width: "100%",
            maxWidth: 300,
            display: "block",
            margin: "0 auto 0.75rem",
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        />
      )}
      <p style={{ fontSize: "0.88rem", color: "#444", lineHeight: 1.6, margin: 0 }}>{children}</p>
    </div>
  )
}

const NAV_ITEMS = [
  { id: "access",   label: "Sign In & Register" },
  { id: "profile",  label: "Profile" },
  { id: "movies",   label: "Movies" },
  { id: "social",   label: "Social" },
  { id: "bookclub", label: "Book Club" },
  { id: "bar",      label: "My Bar" },
  { id: "calendar", label: "Calendar" },
  { id: "bookings", label: "Bookings" },
]

export default function HelpGuidePage() {
  const [activeSection, setActiveSection] = useState(null)

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
    setActiveSection(id)
  }

  return (
    <>
      <style>{PRINT_STYLE}</style>

      <div style={{ minHeight: "100vh", background: "#faf8f5", fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>

        {/* ── Header ── */}
        <header style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "#fff",
          borderBottom: "3px solid #e6a817",
          padding: "0.6rem 1.25rem",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 1px 8px rgba(0,0,0,0.07)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
            <img src="/logo_hex_bee.png" alt="The Social Hive" style={{ width: 40, height: 40 }} />
            <div style={{ lineHeight: 1 }}>
              <div style={{ fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.14em", color: "#e6a817", textTransform: "uppercase" }}>The</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 900, letterSpacing: "0.07em", color: "#e6a817", textTransform: "uppercase" }}>Social Hive</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="no-print" style={{ fontSize: "0.75rem", color: "#888", fontWeight: 500 }}>Help Guide</span>
            <button
              className="no-print"
              onClick={() => window.print()}
              style={{
                padding: "0.45rem 1rem",
                background: "#2a9d8f",
                color: "#fff",
                border: "none",
                borderRadius: 20,
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              ↓ Save as PDF
            </button>
          </div>
        </header>

        {/* ── Jump nav ── */}
        <div className="no-print" style={{
          overflowX: "auto",
          whiteSpace: "nowrap",
          padding: "0.65rem 1rem",
          borderBottom: "1px solid #e2e8f0",
          background: "#fff",
          scrollbarWidth: "none",
        }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => scrollTo(item.id)}
              style={{
                display: "inline-block",
                marginRight: "0.4rem",
                padding: "0.35rem 0.85rem",
                borderRadius: 20,
                border: "1px solid #e2e8f0",
                background: activeSection === item.id ? "#2a9d8f" : "transparent",
                color: activeSection === item.id ? "#fff" : "#666",
                fontSize: "0.78rem",
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "1.5rem 1.25rem 3rem" }}>

          <h1 style={{ fontSize: "1.3rem", fontWeight: 800, color: "#2a9d8f", margin: "0 0 1.5rem" }}>
            The Social Hive — User Guide
          </h1>

          {/* SIGN IN & REGISTER */}
          <Section id="access" title="Sign In & Register">
            <Subsection title="Sign In">
              <Step img={IMG("01-login.png")} alt="Sign In screen">
                Enter your username and password, then tap <strong>Sign In</strong>.
              </Step>
            </Subsection>
            <Subsection title="Register">
              <Step img={IMG("02-register.png")} alt="Register screen">
                Tap <strong>Register</strong> at the top of the sign-in screen. Enter the invite code,
                choose a username and password, then tap <strong>Register</strong>.
              </Step>
            </Subsection>
            <Subsection title="Change Password">
              <Step img={IMG("03-change-password.png")} alt="Change Password screen">
                Tap <strong>Change Password</strong> at the top of the sign-in screen. Enter your
                username, current password, and a new password, then confirm.
              </Step>
            </Subsection>
          </Section>

          {/* PROFILE */}
          <Section id="profile" title="Profile &amp; PIN">
            <Subsection title="Your Profile">
              <Step img={IMG("05-profile.png")} alt="Profile screen">
                Tap your name in the top-right corner on any screen. Select <strong>Update Profile</strong>
                to update your display name, email, and house number.
              </Step>
            </Subsection>
            <Subsection title="Change PIN">
              <Step>
                Tap your name in the top-right, then select <strong>Change PIN</strong> to set a new
                4-digit PIN. Your PIN is used when recording bar purchases.
              </Step>
            </Subsection>
          </Section>

          {/* MOVIES */}
          <Section id="movies" title="Movies">
            <Subsection title="Movies Home">
              <Step img={IMG("06-movies.png")} alt="Movies home">
                Shows your next upcoming screening and quick links to scheduled events and suggestions.
              </Step>
            </Subsection>
            <Subsection title="Scheduled Screenings">
              <Step img={IMG("07-screenings.png")} alt="Scheduled screenings list">
                See all upcoming screenings with date, ratings, and seat availability.
                Tap any card to open the booking panel.
              </Step>
            </Subsection>
            <Subsection title="Booking a Seat">
              <Step img={IMG("10-screening-slideout.png")} alt="Booking panel">
                Tap <strong>Reserve my seat</strong> and choose the number of seats.
                If full, tap <strong>Join Waitlist</strong>.
              </Step>
            </Subsection>
            <Subsection title="Suggestions Library">
              <Step img={IMG("08-library.png")} alt="Movie suggestions library">
                Browse or search movies suggested for future screenings.
              </Step>
            </Subsection>
            <Subsection title="DVD Library">
              <Step img={IMG("09-dvd.png")} alt="DVD library">
                Browse the community DVD collection and suggest titles for an upcoming screening.
              </Step>
            </Subsection>
            <Subsection title="Coordinator Panel" ecOnly>
              <Step>
                ECs see a <strong>Coordinator View</strong> inside each booking panel — attendee names,
                seat counts, unpaid seats, notes editor, and the ability to cancel individual bookings.
              </Step>
            </Subsection>
          </Section>

          {/* SOCIAL */}
          <Section id="social" title="Social">
            <Subsection title="Social Hub">
              <Step img={IMG("11-social.png")} alt="Social hub">
                Lists upcoming community events — dinners, trips, activities.
              </Step>
            </Subsection>
            <Subsection title="Event List">
              <Step img={IMG("12-social-events.png")} alt="Social events list">
                Tap any event card to open the detail panel and book your seat.
              </Step>
            </Subsection>
            <Subsection title="Event Detail & Booking">
              <Step img={IMG("13-social-slideout.png")} alt="Social event detail">
                Shows the description, date, location, coordinator, bus info, and available seats.
                Tap <strong>Reserve seats</strong> to book.
              </Step>
            </Subsection>
            <Subsection title="Coordinator Panel" ecOnly>
              <Step>
                ECs see the full attendee list with seat counts and unpaid bookings, and can
                cancel any booking from the coordinator panel.
              </Step>
            </Subsection>
          </Section>

          {/* BOOK CLUB */}
          <Section id="bookclub" title="Book Club">
            <Subsection title="Book Club Home">
              <Step img={IMG("14-bookclub.png")} alt="Book Club home">
                See the current book pick, upcoming meetings, and recent suggestions.
              </Step>
            </Subsection>
            <Subsection title="Suggest a Book">
              <Step img={IMG("15-bookclub-suggest.png")} alt="Book suggestions">
                Tap <strong>Suggestions</strong> to browse existing suggestions or add your own
                for the group to vote on.
              </Step>
            </Subsection>
          </Section>

          {/* BAR */}
          <Section id="bar" title="My Bar">
            <Subsection title="Bar Home">
              <Step img={IMG("16-bar.png")} alt="Bar home">
                Browse available drinks and prices. Tap <strong>Add</strong> to record a purchase
                against your tab.
              </Step>
            </Subsection>
            <Subsection title="Recording a Purchase">
              <Step>
                Select an item, confirm quantity, then enter your 4-digit PIN to confirm.
                Your tab updates immediately.
              </Step>
            </Subsection>
            <Subsection title="Bar Reconciliation" ecOnly>
              <Step>
                ECs can view all member tabs, mark amounts as paid, and reconcile the full bar
                ledger from the Bar admin panel.
              </Step>
            </Subsection>
          </Section>

          {/* CALENDAR */}
          <Section id="calendar" title="Calendar">
            <Step img={IMG("17-calendar.png")} alt="Community calendar">
              All upcoming events across Movies, Social, and Book Club in one view.
              Toggle between month and week view at the top.
              Tap any event to open its detail panel and book.
            </Step>
          </Section>

          {/* BOOKINGS */}
          <Section id="bookings" title="My Bookings">
            <Step img={IMG("18-bookings.png")} alt="My bookings">
              All your current reservations in one place. Filter by hub using the tabs at the top.
              Tap any booking to view the event detail or manage your seat.
            </Step>
            <Subsection title="Booking Status">
              <Step>
                <strong>Confirmed</strong> — seat secured.{" "}
                <strong>Pending Payment</strong> — payment required before the event.{" "}
                <strong>Waitlisted</strong> — you will be notified if a seat becomes available.
              </Step>
            </Subsection>
          </Section>

          <p style={{ fontSize: "0.75rem", color: "#aaa", textAlign: "center", marginTop: "1.5rem" }}>
            Need further help? Speak to your Element Communities coordinator.
          </p>

        </div>
      </div>
    </>
  )
}
