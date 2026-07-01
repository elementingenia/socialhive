"use client"
import { useState } from "react"

const IMG = (name) =>
  `https://tzzxwvbqszzrruxjrpcs.supabase.co/storage/v1/object/public/help-screenshots/${name}`

const EC_BADGE = (
  <span style={{
    display: "inline-block",
    background: "var(--teal)",
    color: "#fff",
    fontSize: "0.65rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
    padding: "2px 7px",
    borderRadius: 20,
    marginLeft: 6,
    verticalAlign: "middle",
    textTransform: "uppercase",
  }}>EC only</span>
)

function Section({ id, title, children }) {
  return (
    <section id={id} style={{ marginBottom: "2.5rem" }}>
      <h2 style={{
        fontSize: "1.1rem",
        fontWeight: 700,
        color: "var(--teal)",
        marginBottom: "1rem",
        paddingBottom: "0.4rem",
        borderBottom: "2px solid var(--teal)",
      }}>{title}</h2>
      {children}
    </section>
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
            maxWidth: 320,
            display: "block",
            margin: "0 auto 0.75rem",
            borderRadius: 12,
            border: "1px solid var(--border)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        />
      )}
      <p style={{ fontSize: "0.9rem", color: "var(--text)", lineHeight: 1.5, margin: 0 }}>{children}</p>
    </div>
  )
}

function Subsection({ title, ecOnly, children }) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <h3 style={{
        fontSize: "0.95rem",
        fontWeight: 600,
        color: "var(--text)",
        marginBottom: "0.75rem",
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}>
        {title}{ecOnly && EC_BADGE}
      </h3>
      {children}
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

export default function HelpPage() {
  const [activeSection, setActiveSection] = useState(null)

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
    setActiveSection(id)
  }

  return (
    <>

      <div style={{
        overflowX: "auto",
        whiteSpace: "nowrap",
        padding: "0.75rem 1rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        scrollbarWidth: "none",
      }}>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => scrollTo(item.id)}
            style={{
              display: "inline-block",
              marginRight: "0.5rem",
              padding: "0.4rem 0.9rem",
              borderRadius: 20,
              border: "1px solid var(--border)",
              background: activeSection === item.id ? "var(--teal)" : "transparent",
              color: activeSection === item.id ? "#fff" : "var(--text-muted)",
              fontSize: "0.8rem",
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

      <div style={{ padding: "1.25rem 1rem 2rem" }}>

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
              Tap <strong>Change Password</strong> at the top of the sign-in screen. Enter your username,
              current password and a new password, then confirm.
            </Step>
          </Subsection>
        </Section>

        <Section id="profile" title="Profile & PIN">
          <Subsection title="Your Profile">
            <Step img={IMG("05-profile.png")} alt="Profile screen">
              Tap the <strong>person icon</strong> (top-right of the home screen) to update your
              display name, email, and house number.
            </Step>
          </Subsection>
          <Subsection title="Change PIN">
            <Step>
              On your Profile page, tap <strong>Change PIN</strong> to set a new 4-digit PIN.
              Your PIN is used when recording bar purchases.
            </Step>
          </Subsection>
        </Section>

        <Section id="movies" title="Movies">
          <Subsection title="Movies Home">
            <Step img={IMG("06-movies.png")} alt="Movies home">
              Shows your next upcoming screening and quick links to all scheduled events and suggestions.
            </Step>
          </Subsection>
          <Subsection title="Scheduled Screenings">
            <Step img={IMG("07-screenings.png")} alt="Scheduled screenings list">
              See all upcoming screenings with date, ratings, and seat availability. Tap any card to book.
            </Step>
          </Subsection>
          <Subsection title="Booking a Seat">
            <Step img={IMG("10-screening-slideout.png")} alt="Screening booking panel">
              Tap <strong>Reserve my seat</strong> and choose the number of seats. If full, tap
              <strong> Join Waitlist</strong> to be notified if a seat opens.
            </Step>
          </Subsection>
          <Subsection title="Suggestions Library">
            <Step img={IMG("08-library.png")} alt="Movie suggestions library">
              Browse or search movies suggested for future screenings. Tap any title for more detail.
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

        <Section id="social" title="Social">
          <Subsection title="Social Hub">
            <Step img={IMG("11-social.png")} alt="Social hub home">
              Lists upcoming community events — dinners, trips, activities — across all event types.
            </Step>
          </Subsection>
          <Subsection title="Event List">
            <Step img={IMG("12-social-events.png")} alt="Social events list">
              Tap any event card to open the detail panel and book your seat.
            </Step>
          </Subsection>
          <Subsection title="Event Detail & Booking">
            <Step img={IMG("13-social-slideout.png")} alt="Social event detail panel">
              The detail panel shows the description, date, location, coordinator, bus info, and available
              seats. Tap <strong>Reserve seats</strong> to book.
            </Step>
          </Subsection>
          <Subsection title="Coordinator Panel" ecOnly>
            <Step>
              ECs see the full attendee list with seat counts and unpaid bookings. They can add notes or
              cancel any booking from the coordinator panel.
            </Step>
          </Subsection>
        </Section>

        <Section id="bookclub" title="Book Club">
          <Subsection title="Book Club Home">
            <Step img={IMG("14-bookclub.png")} alt="Book Club home">
              See the current book pick, upcoming meetings, and recent suggestions.
            </Step>
          </Subsection>
          <Subsection title="Suggest a Book">
            <Step img={IMG("15-bookclub-suggest.png")} alt="Book suggestions">
              Tap <strong>Suggestions</strong> to browse existing suggestions or add your own for
              the group to vote on.
            </Step>
          </Subsection>
        </Section>

        <Section id="bar" title="My Bar">
          <Subsection title="Bar Home">
            <Step img={IMG("16-bar.png")} alt="Bar home">
              Browse available drinks and prices. Tap <strong>Add</strong> next to any item to record
              a purchase against your tab.
            </Step>
          </Subsection>
          <Subsection title="Recording a Purchase">
            <Step>
              Select an item, confirm quantity, then enter your 4-digit PIN to confirm. Your tab updates
              immediately.
            </Step>
          </Subsection>
          <Subsection title="Bar Reconciliation" ecOnly>
            <Step>
              ECs can view all member tabs, mark amounts as paid, and reconcile the full bar ledger
              from the Bar admin panel.
            </Step>
          </Subsection>
        </Section>

        <Section id="calendar" title="Calendar">
          <Step img={IMG("17-calendar.png")} alt="Community calendar">
            All upcoming events across Movies, Social, and Book Club in one view. Toggle between
            month and week using the buttons at the top. Tap any event to open its detail panel and book.
          </Step>
        </Section>

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

        <p style={{
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          textAlign: "center",
          marginTop: "1rem",
          padding: "0.5rem 0 3rem",
        }}>
          Need further help? Speak to your Element Communities coordinator.
        </p>

      </div>
    </>
  )
}
