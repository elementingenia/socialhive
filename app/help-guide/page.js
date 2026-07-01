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
  {
    id: "header", num: "—", title: "Getting Around — The App Header",
    subs: [
      { title: "The header bar",                    id: "sub-header-bar" },
      { title: "Your account menu (avatar pill)",   id: "sub-header-account" },
    ],
  },
  {
    id: "access", num: 1, title: "Signing In, Registering & Changing Your Password",
    subs: [
      { title: "Sign In",                    id: "sub-signin" },
      { title: "Register — first time users", id: "sub-register" },
      { title: "Change Password",             id: "sub-password" },
    ],
  },
  {
    id: "profile", num: 2, title: "Your Profile & PIN",
    subs: [
      { title: "Updating your profile", id: "sub-profile-update" },
      { title: "Changing your PIN",     id: "sub-profile-pin" },
    ],
  },
  {
    id: "movies", num: 3, title: "Movies — Screenings, Booking & Library",
    subs: [
      { title: "Movies Home layout",                         id: "sub-movies-home" },
      { title: "The Next Screening card",                    id: "sub-movies-nextcard" },
      { title: "IMDb & Rotten Tomatoes ratings",             id: "sub-movies-ratings" },
      { title: "Booking a seat",                             id: "sub-movies-booking" },
      { title: "After you have booked",                      id: "sub-movies-afterbook" },
      { title: "Rating films — the community voting panel",  id: "sub-movies-voting" },
      { title: "Scheduled screenings list",                  id: "sub-movies-scheduled" },
      { title: "Suggestions library",                        id: "sub-movies-library" },
      { title: "DVD library",                                id: "sub-movies-dvd" },
      { title: "Coordinator panel (EC only)",                id: "sub-movies-ec" },
    ],
  },
  {
    id: "social", num: 4, title: "Social Events — Community Activities & Trips",
    subs: [
      { title: "Social hub home",              id: "sub-social-home" },
      { title: "Viewing and booking events",   id: "sub-social-events" },
      { title: "Event detail & booking",       id: "sub-social-detail" },
      { title: "Coordinator panel (EC only)",  id: "sub-social-ec" },
    ],
  },
  {
    id: "bookclub", num: 5, title: "Book Club",
    subs: [
      { title: "Book Club home",       id: "sub-bookclub-home" },
      { title: "Signing up & suggestions", id: "sub-bookclub-signup" },
    ],
  },
  {
    id: "bar", num: 6, title: "My Bar — Honour Bar & Tab",
    subs: [
      { title: "The bar menu",              id: "sub-bar-menu" },
      { title: "Adding to your tab",        id: "sub-bar-add" },
      { title: "Your current tab",          id: "sub-bar-tab" },
      { title: "Reconciliation (EC only)",  id: "sub-bar-ec" },
    ],
  },
  {
    id: "calendar", num: 7, title: "Community Calendar",
    subs: [],
  },
  {
    id: "bookings", num: 8, title: "My Bookings",
    subs: [
      { title: "Understanding booking status", id: "sub-bookings-status" },
    ],
  },
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
        alignItems: "center",
        gap: "0.6rem",
      }}>
        {num !== "—" && (
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
        )}
        {title}
      </h2>
      {children}
    </section>
  )
}

function Subsection({ id, title, ecOnly, children }) {
  return (
    <div id={id} style={{ marginBottom: "1.75rem", paddingLeft: "0.5rem", borderLeft: `3px solid ${border}`, scrollMarginTop: "1rem" }}>
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
      <p style={{ fontSize: "0.88rem", color: "#444", lineHeight: 1.7, margin: 0 }}>{children}</p>
    </div>
  )
}

function InfoBox({ children }) {
  return (
    <div style={{
      background: "#f0faf9",
      border: `1px solid ${teal}`,
      borderRadius: 10,
      padding: "0.75rem 1rem",
      marginBottom: "1rem",
      fontSize: "0.85rem",
      color: "#1a5c55",
      lineHeight: 1.65,
    }}>
      {children}
    </div>
  )
}

export default function HelpGuidePage() {
  const [tocOpen, setTocOpen] = useState(true)

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const tocBtnStyle = {
    background: "none", border: "none", cursor: "pointer",
    fontFamily: "inherit", padding: 0, textAlign: "left",
    textDecoration: "underline",
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

          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
            <img src="/logo_hex_bee.png" alt="" style={{ width: 52, height: 52, filter: "brightness(0) invert(1) opacity(0.9)" }} />
            <div>
              <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.18em", opacity: 0.8, textTransform: "uppercase", marginBottom: 2 }}>The Social Hive</div>
              <div style={{ fontSize: "1.6rem", fontWeight: 900, lineHeight: 1.1 }}>User Guide</div>
            </div>
          </div>

          <p style={{ fontSize: "0.9rem", lineHeight: 1.65, opacity: 0.92, margin: 0, maxWidth: 560 }}>
            Welcome to The Social Hive — the community app for Fullerton Cove residents. This guide
            covers everything from signing in for the first time, to booking events, browsing movies,
            tracking your bar tab, and more. Sections marked <strong>EC only</strong> are for Element
            Communities coordinators.
          </p>
        </header>

        {/* ── Table of Contents ── */}
        <div style={{ background: "#fff", borderBottom: `1px solid ${border}` }}>
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

          <div style={{ display: tocOpen ? "block" : "none" }}>
            <ol style={{ margin: 0, padding: "0.75rem 1.25rem 1rem 2.5rem", listStyle: "none" }}>
              {SECTIONS.map(s => (
                <li key={s.id} style={{ marginBottom: "0.6rem" }}>
                  <button
                    className="no-print"
                    onClick={() => scrollTo(s.id)}
                    style={{
                      ...tocBtnStyle,
                      fontSize: "0.88rem",
                      color: teal,
                      fontWeight: 700,
                      textDecorationColor: "rgba(42,157,143,0.3)",
                    }}
                  >
                    {s.num !== "—" ? `${s.num}. ` : ""}{s.title}
                  </button>
                  {s.subs && s.subs.length > 0 && (
                    <ul style={{ margin: "0.3rem 0 0 1rem", padding: 0, listStyle: "none" }}>
                      {s.subs.map(sub => (
                        <li key={sub.id} style={{ marginBottom: "0.15rem" }}>
                          <button
                            className="no-print"
                            onClick={() => scrollTo(sub.id)}
                            style={{
                              ...tocBtnStyle,
                              fontSize: "0.79rem",
                              color: "#2a7a72",
                              fontWeight: 500,
                              textDecorationColor: "rgba(42,157,143,0.2)",
                            }}
                          >
                            › {sub.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* ── Main content ── */}
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1.25rem 4rem" }}>

          {/* ── HEADER (no number) ── */}
          <Section id="header" num="—" title="Getting Around — The App Header">
            <Subsection id="sub-header-bar" title="The header bar">
              <Step img={IMG("06-movies.png")} alt="App header bar">
                Every page in The Social Hive has a header bar at the top of the screen. It has three
                parts:
              </Step>
              <Step>
                <strong>Left — The Social Hive logo.</strong> Tapping the logo takes you directly back
                to the Home page from anywhere in the app.
              </Step>
              <Step>
                <strong>Centre — Current page name.</strong> This tells you which section of the app you
                are in — for example "Movies", "Social Events", "Calendar", or "My Bookings". It updates
                automatically as you move around the app.
              </Step>
              <Step>
                <strong>Right — Your account controls.</strong> On the right-hand side you will see up
                to three items: a bell icon for notifications (only appears when you have unread
                notifications), a <strong>?</strong> button that opens this help guide in a new tab, and
                your <strong>account pill</strong> showing your name (and your photo if you have uploaded
                one).
              </Step>
            </Subsection>

            <Subsection id="sub-header-account" title="Your account menu (avatar pill)">
              <Step>
                Tap your name or profile photo on the right-hand side of the header to open the account
                menu. This menu has three options:
              </Step>
              <Step>
                <strong>Update Profile</strong> — change your display name, email address, and house
                number. If you upload a profile photo, it will appear in the header pill instead of your
                name.
              </Step>
              <Step>
                <strong>Change PIN</strong> — set or update the 4-digit PIN used to confirm bar
                purchases. You will need this any time you add a drink to your tab.
              </Step>
              <Step>
                <strong>Sign Out</strong> — signs you out of the app completely. Tap <strong>Sign
                In</strong> on the login screen to get back in.
              </Step>
              <InfoBox>
                💡 If you see a red dot or number on the bell icon, you have unread notifications. Tap
                the bell to open the notifications panel and see what's new.
              </InfoBox>
            </Subsection>
          </Section>

          {/* ── 1. SIGN IN & REGISTER ── */}
          <Section id="access" num={1} title="Signing In, Registering & Changing Your Password">
            <Subsection id="sub-signin" title="Sign In">
              <Step img={IMG("01-login.png")} alt="Sign In screen">
                When you open The Social Hive you will see the sign-in screen. Enter your{" "}
                <strong>username</strong> and <strong>password</strong>, then tap{" "}
                <strong>Sign In</strong>. If you have previously signed in on this device, the app
                may remember your username.
              </Step>
            </Subsection>

            <Subsection id="sub-register" title="Register — first time users">
              <Step img={IMG("02-register.png")} alt="Register screen">
                If this is your first time, tap <strong>Register</strong> at the top of the sign-in
                screen. You will need the <strong>invite code</strong> provided by your Element
                Communities coordinator — without it you cannot register. Enter the invite code, choose
                a username (something easy for you to remember), set a password, then tap{" "}
                <strong>Register</strong>. You can sign in immediately after.
              </Step>
            </Subsection>

            <Subsection id="sub-password" title="Change Password">
              <Step img={IMG("03-change-password.png")} alt="Change Password screen">
                Tap <strong>Change Password</strong> at the top of the sign-in screen. Enter your
                username, your current password, then your new password. Tap{" "}
                <strong>Change Password</strong> to save. You can sign in straight away using your
                new password.
              </Step>
            </Subsection>
          </Section>

          {/* ── 2. PROFILE ── */}
          <Section id="profile" num={2} title="Your Profile & PIN">
            <Subsection id="sub-profile-update" title="Updating your profile">
              <Step img={IMG("05-profile.png")} alt="Profile screen">
                Tap your name or photo in the top-right corner of any page to open the account menu,
                then tap <strong>Update Profile</strong>. From here you can update your display name,
                email address, and house number. If you want to add a profile photo, tap the avatar
                area at the top of the profile screen to choose an image.
              </Step>
            </Subsection>

            <Subsection id="sub-profile-pin" title="Changing your PIN">
              <Step>
                From the same account menu (top-right), tap <strong>Change PIN</strong>. Enter your
                current 4-digit PIN, then enter and confirm your new PIN. Your PIN is required every
                time you add a purchase to your bar tab — if you have not set one yet, do this before
                visiting the bar.
              </Step>
              <InfoBox>
                💡 If you forget your PIN, contact your coordinator — they can reset it for you.
              </InfoBox>
            </Subsection>
          </Section>

          {/* ── 3. MOVIES ── */}
          <Section id="movies" num={3} title="Movies — Screenings, Booking & Library">
            <Subsection id="sub-movies-home" title="Movies Home layout">
              <Step img={IMG("06-movies.png")} alt="Movies Home screen">
                The Movies Home screen is your central hub for everything related to community
                screenings. It is divided into several panels stacked vertically on the page:
              </Step>
              <Step>
                <strong>Welcome message</strong> — if your coordinator has posted a message, it
                appears as a banner at the top in a warm amber and teal gradient. Tap the{" "}
                <strong>✕</strong> to dismiss it.
              </Step>
              <Step>
                <strong>Next Screening card</strong> — a teal-headed card showing the very next
                upcoming movie event. This is the most important panel on the page and is described
                in detail below.
              </Step>
              <Step>
                <strong>My Bookings card</strong> — an amber-headed card showing your next upcoming
                movie bookings (up to three). Tap <strong>View all ›</strong> to go to the full
                My Bookings page.
              </Step>
              <Step>
                <strong>Rate a Film panel</strong> — if you have recently attended a screening and
                have not yet rated the movie, a voting panel appears here. See "Rating films" below.
              </Step>
            </Subsection>

            <Subsection id="sub-movies-nextcard" title="The Next Screening card">
              <Step>
                The teal header strip shows the event name, how many days away it is, and a prompt to
                tap and book. Inside the card you will see the movie <strong>poster</strong>, title and{" "}
                <strong>date/time</strong> highlighted in teal, <strong>IMDb and Rotten Tomatoes score
                chips</strong> (tap either to read reviews), the <strong>coordinator's name</strong>,
                and a short two-line <strong>plot summary</strong>.
              </Step>
              <Step>
                At the bottom you will see either a <strong>seat count chip</strong> with a "Tap to
                book →" prompt, or a green confirmation if you have already booked.
                <strong> Tap anywhere on the card</strong> to open the full booking panel.
              </Step>
            </Subsection>

            <Subsection id="sub-movies-ratings" title="IMDb & Rotten Tomatoes ratings">
              <Step>
                You will see two rating chips on movie cards — a gold <strong>⭐ IMDb</strong> score
                and a red <strong>🍅 Rotten Tomatoes</strong> score. <strong>Tap the IMDb chip</strong>{" "}
                to open the film's full page on IMDb in a new browser tab — cast list, synopsis, and
                reviews. <strong>Tap the Rotten Tomatoes chip</strong> to search for the film on Rotten
                Tomatoes and read critic and audience reviews. Both links open safely in a new tab.
              </Step>
            </Subsection>

            <Subsection id="sub-movies-booking" title="Booking a seat">
              <Step img={IMG("10-screening-slideout.png")} alt="Booking panel">
                Tap any movie card to open the booking panel, which slides up from the bottom of the
                screen. It shows the full event details — title, poster, date, time, plot, ratings,
                coordinator name, and a real-time capacity bar (e.g. "8/20 seats taken").
              </Step>
              <Step>
                Select how many seats you need, then tap:
              </Step>
              <Step>
                <strong>Book Now</strong> — appears when seats are available. Confirms your booking
                immediately.
              </Step>
              <Step>
                <strong>Join Waitlist</strong> — appears when the screening is full. Joins the waitlist;
                you will be notified automatically if a seat opens up.
              </Step>
            </Subsection>

            <Subsection id="sub-movies-afterbook" title="After you have booked">
              <Step>
                Once booked, the panel updates to show a green confirmation: <strong>✓ X seats
                confirmed</strong>. Two buttons appear:
              </Step>
              <Step>
                <strong>Modify Seats</strong> — change the number of seats in your booking.
              </Step>
              <Step>
                <strong>Cancel Booking</strong> — cancel your reservation entirely (shown with a red
                border). Your seat is released immediately for other residents.
              </Step>
            </Subsection>

            <Subsection id="sub-movies-voting" title="Rating films — the community voting panel">
              <Step>
                The voting panel appears on Movies Home when there are upcoming films waiting for your
                rating. It shows the film title, how many films are in your queue (e.g. "3 of 5 to
                rate"), and a grid of buttons numbered <strong>1 to 10</strong>, ranging from "Not
                interested" to "Can't wait!".
              </Step>
              <Step>
                Tap the number that matches your interest. Your rating is saved instantly and the next
                film appears. Tap <strong>Skip this one</strong> to pass, or <strong>Skip all</strong>{" "}
                to dismiss the queue. Your ratings contribute to the <strong>community score</strong>{" "}
                shown on movie cards.
              </Step>
            </Subsection>

            <Subsection id="sub-movies-scheduled" title="Scheduled screenings list">
              <Step img={IMG("07-screenings.png")} alt="Scheduled screenings">
                Tap <strong>Scheduled</strong> from the Movies Home to see all upcoming screenings.
                Each card shows the title, date and time, IMDb and Rotten Tomatoes scores, seats
                available, and your booking status. Tap any card to open the booking panel.
              </Step>
            </Subsection>

            <Subsection id="sub-movies-library" title="Suggestions library">
              <Step img={IMG("08-library.png")} alt="Suggestions library">
                The Suggestions library is a collection of films proposed by residents for future
                screenings. Browse, search, or filter by genre. Tap any title for full details
                including plot, cast, IMDb rating, and the community voting score. You can rate the
                film from this detail view.
              </Step>
            </Subsection>

            <Subsection id="sub-movies-dvd" title="DVD library">
              <Step img={IMG("09-dvd.png")} alt="DVD library">
                The DVD Library shows the community's physical disc collection. Browse or search the
                collection. Tap any title to see details and — if you think it would make a great
                screening — tap <strong>Suggest for Screening</strong> to add it to the Suggestions
                list for coordinator review.
              </Step>
            </Subsection>

            <Subsection id="sub-movies-ec" title="Coordinator panel" ecOnly>
              <Step>
                ECs see an additional <strong>Coordinator View</strong> section at the bottom of every
                booking panel — a full attendee list with names, seat counts, and unpaid tallies. ECs
                can cancel individual bookings and monitor waitlist numbers in real time.
              </Step>
            </Subsection>
          </Section>

          {/* ── 4. SOCIAL ── */}
          <Section id="social" num={4} title="Social Events — Community Activities & Trips">
            <Subsection id="sub-social-home" title="Social hub home">
              <Step img={IMG("11-social.png")} alt="Social hub home">
                The Social hub is your home for community activities — dinners, day trips, outings,
                themed evenings, and more. The layout mirrors the Movies Home: a <strong>Next Social
                Event</strong> card at the top (terracotta header) with the nearest upcoming event,
                followed by a <strong>My Bookings</strong> card for your social reservations.
              </Step>
              <Step>
                The Next Social Event card shows title, date, time, location, description, coordinator
                name, seat availability, and a cost chip if the event has a per-person price. A bus
                icon and driver name appear if transport is available. <strong>Tap the card</strong> to
                open the full booking panel.
              </Step>
            </Subsection>

            <Subsection id="sub-social-events" title="Viewing and booking events">
              <Step img={IMG("12-social-events.png")} alt="Social events list">
                Tap <strong>Scheduled</strong> from the Social hub to see all upcoming social events.
                Each card shows the event title, date and time, location, cost, and seat availability.
                Tap any card to open the event detail panel.
              </Step>
            </Subsection>

            <Subsection id="sub-social-detail" title="Event detail & booking">
              <Step img={IMG("13-social-slideout.png")} alt="Event detail panel">
                The event detail panel slides up from the bottom and shows the full event description,
                date, time, location (including an offsite address if applicable), coordinator name, bus
                details, cost per person, and the seat capacity bar.
              </Step>
              <Step>
                Select the number of seats you need, then tap <strong>Book Now</strong> (seats
                available) or <strong>Join Waitlist</strong> (event full). After booking, the panel
                shows your confirmation with <strong>Modify Seats</strong> and{" "}
                <strong>Cancel Booking</strong> options — the same as movie screenings.
              </Step>
            </Subsection>

            <Subsection id="sub-social-ec" title="Coordinator panel" ecOnly>
              <Step>
                ECs see the full attendee list inside the event detail panel, with each resident's
                name, seat count, and payment status. ECs can cancel individual bookings or update
                event details directly from this view.
              </Step>
            </Subsection>
          </Section>

          {/* ── 5. BOOK CLUB ── */}
          <Section id="bookclub" num={5} title="Book Club">
            <Subsection id="sub-bookclub-home" title="Book Club home">
              <Step img={IMG("14-bookclub.png")} alt="Book Club home">
                The Book Club section shows the current book pick, upcoming meeting dates, and recent
                suggestions from residents. The current read is displayed prominently at the top with
                the cover, title, and author. If a meeting date has been set, it appears below.
              </Step>
            </Subsection>

            <Subsection id="sub-bookclub-signup" title="Signing up & suggestions">
              <Step img={IMG("15-bookclub-suggest.png")} alt="Book suggestions">
                To attend the next Book Club meeting, tap <strong>Sign Up</strong> on the event card.
                This registers your attendance — the coordinator will see your name on the attendee list.
              </Step>
              <Step>
                Tap <strong>Suggestions</strong> to see books that other residents have put forward for
                the next read. You can vote on suggestions you like, or tap{" "}
                <strong>Add suggestion</strong> to propose your own book — search by title and your
                suggestion is sent to the group straight away.
              </Step>
            </Subsection>
          </Section>

          {/* ── 6. BAR ── */}
          <Section id="bar" num={6} title="My Bar — Honour Bar & Tab">
            <Subsection id="sub-bar-menu" title="The bar menu">
              <Step img={IMG("16-bar.png")} alt="Bar home">
                The community bar operates on an honour system — you record what you take and settle
                your tab at the end of each period. The bar screen shows all available products
                organised by category, each with an icon, name, description, and price.
              </Step>
            </Subsection>

            <Subsection id="sub-bar-add" title="Adding to your tab">
              <Step>
                Tap <strong>+ Add to Tab</strong> on any product to record a purchase. You will be
                prompted to enter your <strong>4-digit PIN</strong> to approve the charge — this
                prevents accidental or unauthorised additions. Once confirmed, the product is added
                to your personal tab immediately.
              </Step>
              <InfoBox>
                💡 If you have not yet set a PIN, go to the account menu (top-right → Change PIN)
                and set one before using the bar.
              </InfoBox>
            </Subsection>

            <Subsection id="sub-bar-tab" title="Your current tab">
              <Step>
                Below the product menu, you can see your <strong>current open tab</strong> — a list of
                everything you have added since the last reconciliation, with quantities and a running
                total. Outstanding amounts from previous unreconciled periods are also shown so you
                have a clear picture of what you owe.
              </Step>
            </Subsection>

            <Subsection id="sub-bar-ec" title="Reconciliation" ecOnly>
              <Step>
                ECs can view all member tabs from the Bar administration panel, mark individual amounts
                as paid, and close reconciliation periods for the whole community. Once a period is
                reconciled, tabs reset to zero for the next period.
              </Step>
            </Subsection>
          </Section>

          {/* ── 7. CALENDAR ── */}
          <Section id="calendar" num={7} title="Community Calendar">
            <Step img={IMG("17-calendar.png")} alt="Community calendar">
              The Calendar brings every upcoming community event together in one view — Movies, Social
              Events, and Book Club meetings all appear here without switching between sections.
            </Step>
            <Step>
              Use the filter buttons at the top to show or hide events by type. Switch between{" "}
              <strong>Month view</strong> and <strong>Week view</strong> using the view toggle. Tap
              any event to open its full detail panel and book your place directly from the calendar.
            </Step>
          </Section>

          {/* ── 8. MY BOOKINGS ── */}
          <Section id="bookings" num={8} title="My Bookings">
            <Step img={IMG("18-bookings.png")} alt="My Bookings screen">
              My Bookings shows all your current reservations across every section of the app —
              Movies, Social Events, and Book Club — in one place. Use the filter tabs at the top
              to narrow the list. Tap any card to open the event detail panel and manage your seat.
            </Step>

            <Subsection id="sub-bookings-status" title="Understanding booking status">
              <Step>
                <strong style={{ color: "#166534" }}>Confirmed</strong> — your seat is secured. No
                further action needed unless you want to modify or cancel.
              </Step>
              <Step>
                <strong style={{ color: "#92400e" }}>Pending Payment</strong> — your booking is held
                but payment has not yet been recorded by the coordinator. Your seat is reserved.
              </Step>
              <Step>
                <strong style={{ color: "#64748b" }}>Waitlisted</strong> — the event was full when
                you registered. You will be notified automatically if a confirmed seat opens up.
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
