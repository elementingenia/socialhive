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
  {
    id: "header",   num: "—", title: "Getting Around — The App Header",
    subs: ["The header bar", "Your account menu (avatar pill)"],
  },
  {
    id: "access",   num: 1,   title: "Signing In, Registering & Changing Your Password",
    subs: ["Sign In", "Register — first time users", "Change Password"],
  },
  {
    id: "profile",  num: 2,   title: "Your Profile & PIN",
    subs: ["Updating your profile", "Changing your PIN"],
  },
  {
    id: "movies",   num: 3,   title: "Movies — Screenings, Booking & Library",
    subs: [
      "Movies Home layout",
      "The Next Screening card",
      "IMDb & Rotten Tomatoes ratings",
      "Booking a seat",
      "After you have booked",
      "Rating films — the community voting panel",
      "Scheduled screenings list",
      "Suggestions library",
      "DVD library",
      "Coordinator panel (EC only)",
    ],
  },
  {
    id: "social",   num: 4,   title: "Social Events — Community Activities & Trips",
    subs: ["Social hub home", "Viewing and booking events", "Event detail & booking", "Coordinator panel (EC only)"],
  },
  {
    id: "bookclub", num: 5,   title: "Book Club",
    subs: ["Book Club home", "Signing up & suggestions"],
  },
  {
    id: "bar",      num: 6,   title: "My Bar — Honour Bar & Tab",
    subs: ["The bar menu", "Adding to your tab", "Your current tab", "Reconciliation (EC only)"],
  },
  {
    id: "calendar", num: 7,   title: "Community Calendar",
    subs: [],
  },
  {
    id: "bookings", num: 8,   title: "My Bookings",
    subs: ["Understanding booking status"],
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
            <ol style={{ margin: 0, padding: "0.75rem 1.25rem 1rem 2.5rem", listStyle: "none", counterReset: "toc" }}>
              {SECTIONS.map(s => (
                <li key={s.id} style={{ marginBottom: "0.6rem" }}>
                  <button
                    className="no-print"
                    onClick={() => scrollTo(s.id)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      fontFamily: "inherit", fontSize: "0.88rem",
                      color: teal, fontWeight: 700, padding: 0,
                      textAlign: "left", textDecoration: "underline",
                      textDecorationColor: "rgba(42,157,143,0.3)",
                    }}
                  >
                    {s.num !== "—" ? `${s.num}. ` : ""}{s.title}
                  </button>
                  {s.subs && s.subs.length > 0 && (
                    <ul style={{ margin: "0.35rem 0 0 1rem", padding: 0, listStyle: "none" }}>
                      {s.subs.map(sub => (
                        <li key={sub} style={{ marginBottom: "0.2rem" }}>
                          <span style={{ fontSize: "0.8rem", color: muted }}>› {sub}</span>
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

          {/* ── HEADER (no number — applies everywhere) ── */}
          <Section id="header" num="—" title="Getting Around — The App Header">

            <Subsection title="The header bar">
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

            <Subsection title="Your account menu (avatar pill)">
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

            <Subsection title="Sign In">
              <Step img={IMG("01-login.png")} alt="Sign In screen">
                When you open The Social Hive you will see the sign-in screen. Enter your{" "}
                <strong>username</strong> and <strong>password</strong>, then tap{" "}
                <strong>Sign In</strong>. If you have previously signed in on this device, the app
                may remember your username.
              </Step>
            </Subsection>

            <Subsection title="Register — first time users">
              <Step img={IMG("02-register.png")} alt="Register screen">
                If this is your first time, tap <strong>Register</strong> at the top of the sign-in
                screen. You will need the <strong>invite code</strong> provided by your Element
                Communities coordinator — without it you cannot register. Enter the invite code, choose
                a username (something easy for you to remember), set a password, then tap{" "}
                <strong>Register</strong>. You can sign in immediately after.
              </Step>
            </Subsection>

            <Subsection title="Change Password">
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

            <Subsection title="Updating your profile">
              <Step img={IMG("05-profile.png")} alt="Profile screen">
                Tap your name or photo in the top-right corner of any page to open the account menu,
                then tap <strong>Update Profile</strong>. From here you can update your display name,
                email address, and house number. If you want to add a profile photo, tap the avatar
                area at the top of the profile screen to choose an image.
              </Step>
            </Subsection>

            <Subsection title="Changing your PIN">
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

            <Subsection title="Movies Home layout">
              <Step img={IMG("06-movies.png")} alt="Movies Home screen">
                The Movies Home screen is your central hub for everything related to community
                screenings. It is divided into several panels stacked vertically on the page:
              </Step>
              <Step>
                <strong>Welcome message</strong> — if your coordinator has posted a message, it
                appears as a banner at the top in a warm amber and teal gradient. Tap the{" "}
                <strong>✕</strong> to dismiss it. It will not reappear unless the coordinator posts
                a new one.
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
              <Step>
                Below the cards, you will find navigation buttons to <strong>Scheduled</strong>{" "}
                (all upcoming screenings), <strong>Suggestions</strong> (movies residents want to
                watch), and <strong>DVD Library</strong> (the community's physical collection).
              </Step>
            </Subsection>

            <Subsection title="The Next Screening card">
              <Step>
                The teal header strip of this card shows the event name, how many days away it is,
                and a prompt to tap and book. Inside the card you will see:
              </Step>
              <Step>
                <strong>Movie poster</strong> on the left. <strong>Title and date/time</strong>{" "}
                (highlighted in teal) on the right. Below those, <strong>IMDb and Rotten Tomatoes
                score chips</strong> — tap either score to open that website and read full reviews
                (see below). The <strong>coordinator's name</strong> appears below the scores, and
                a short two-line <strong>plot summary</strong> is shown beneath that.
              </Step>
              <Step>
                At the bottom of the card, you will see one of the following depending on availability:
                a <strong>seat count chip</strong> (e.g. "4 seats left") with a "Tap to book →"
                prompt, or if you have already booked, a green confirmation showing how many seats
                you have.
              </Step>
              <Step>
                <strong>Tap anywhere on the card</strong> to open the full booking panel for that
                screening.
              </Step>
            </Subsection>

            <Subsection title="IMDb & Rotten Tomatoes ratings">
              <Step>
                You will see two rating chips on movie cards throughout the app — a gold{" "}
                <strong>⭐ IMDb</strong> score and a red <strong>🍅 Rotten Tomatoes</strong> score.
                These are the same ratings you see on those websites for any film.
              </Step>
              <Step>
                <strong>Tap the IMDb chip</strong> to open the full movie page on IMDb in a new
                browser tab — you can read the full synopsis, cast list, and audience reviews there.
                <strong> Tap the Rotten Tomatoes chip</strong> to search for the film on Rotten
                Tomatoes in a new tab and read critic and audience reviews. Both links are safe and
                take you directly to those public websites.
              </Step>
            </Subsection>

            <Subsection title="Booking a seat">
              <Step img={IMG("10-screening-slideout.png")} alt="Booking panel">
                Tap any movie card or the Next Screening card to open the booking panel, which slides
                up from the bottom of the screen. The panel shows the full event details — title,
                poster, date, time, plot, IMDb and Rotten Tomatoes ratings, coordinator name, and a
                real-time capacity bar showing how many seats have been taken (e.g. "8/20 seats
                taken").
              </Step>
              <Step>
                To book, select how many seats you need using the number selector, then tap:
              </Step>
              <Step>
                <strong>Book Now</strong> — this button appears when seats are available. Tap it to
                confirm your booking immediately.
              </Step>
              <Step>
                <strong>Join Waitlist</strong> — this button appears when the screening is full. Tap
                it to join the waitlist. If a seat becomes available you will receive a notification
                automatically.
              </Step>
            </Subsection>

            <Subsection title="After you have booked">
              <Step>
                Once booked, the booking panel updates to show a green confirmation: <strong>✓ X
                seats confirmed</strong> (where X is the number you booked). Two additional buttons
                appear:
              </Step>
              <Step>
                <strong>Modify Seats</strong> — tap this to change the number of seats in your
                booking.
              </Step>
              <Step>
                <strong>Cancel Booking</strong> — tap this (shown with a red border) to cancel your
                reservation entirely. Your seat will be released for other residents.
              </Step>
              <Step>
                If payment is required for an event, your booking will show a{" "}
                <strong>Pending Payment</strong> status until the coordinator has marked it as paid.
              </Step>
            </Subsection>

            <Subsection title="Rating films — the community voting panel">
              <Step img={IMG("06-movies.png")} alt="Rating panel">
                The Social Hive lets residents rate upcoming films before a screening so everyone can
                see what the community is most keen to watch. This helps coordinators choose the most
                popular picks.
              </Step>
              <Step>
                The voting panel appears on the Movies Home screen when there are films waiting for
                your rating. It shows the film title, how many films are still in your queue (e.g.
                "3 of 5 to rate"), and a grid of buttons numbered <strong>1 to 10</strong>.
              </Step>
              <Step>
                The scale runs from "Not interested" (1) through to "Can't wait!" (10). Simply tap
                the number that matches your level of interest. Your rating is recorded instantly and
                the next film in your queue appears automatically.
              </Step>
              <Step>
                If you don't want to rate a particular film, tap <strong>Skip this one</strong>. To
                dismiss all remaining films at once, tap <strong>Skip all</strong>. Your ratings
                contribute to the <strong>community score</strong> shown on movie cards — the average
                of all resident ratings.
              </Step>
            </Subsection>

            <Subsection title="Scheduled screenings list">
              <Step img={IMG("07-screenings.png")} alt="Scheduled screenings">
                Tap <strong>Scheduled</strong> from the Movies Home to see a full list of all
                upcoming screenings. Each card shows the movie title, date and time, IMDb and Rotten
                Tomatoes scores, how many seats are still available, and your booking status if you
                have already reserved a seat. Tap any card to open the booking panel.
              </Step>
            </Subsection>

            <Subsection title="Suggestions library">
              <Step img={IMG("08-library.png")} alt="Suggestions library">
                The Suggestions library is a collection of films that residents have proposed for
                future screenings. You can browse the full list, search by title, or filter by
                genre. Tap any title to see the full details including plot, cast, IMDb rating,
                and the community voting score. You can also rate the film from this detail view.
              </Step>
            </Subsection>

            <Subsection title="DVD library">
              <Step img={IMG("09-dvd.png")} alt="DVD library">
                The DVD Library shows the community's physical disc collection — films, TV series,
                and music or documentary titles owned by the community. Browse or search the
                collection. Tap any title to see details and, if you think it would make a great
                screening, tap <strong>Suggest for Screening</strong> to add it to the Suggestions
                list for coordinator review.
              </Step>
            </Subsection>

            <Subsection title="Coordinator panel" ecOnly>
              <Step>
                ECs see an additional <strong>Coordinator View</strong> section at the bottom of
                every booking panel. This lists all confirmed attendees with their names, number of
                seats, and unpaid counts. ECs can cancel any individual booking directly from this
                panel, add event notes, and monitor waitlist numbers in real time.
              </Step>
            </Subsection>

          </Section>

          {/* ── 4. SOCIAL ── */}
          <Section id="social" num={4} title="Social Events — Community Activities & Trips">

            <Subsection title="Social hub home">
              <Step img={IMG("11-social.png")} alt="Social hub home">
                The Social hub is your home for community activities — dinners, day trips, outings,
                themed evenings, and more. The layout mirrors the Movies Home: a <strong>Next Social
                Event</strong> card at the top (terracotta header strip) with the nearest upcoming
                event, followed by a <strong>My Bookings</strong> card showing your upcoming social
                reservations.
              </Step>
              <Step>
                The Next Social Event card shows the event title, date, time, location, a brief
                description, coordinator name, and seat availability. A cost chip appears if the
                event has a per-person price. If transport is available, a bus icon and driver name
                will also appear.
              </Step>
              <Step>
                <strong>Tap the card</strong> to open the full event detail and booking panel.
              </Step>
            </Subsection>

            <Subsection title="Viewing and booking events">
              <Step img={IMG("12-social-events.png")} alt="Social events list">
                Tap <strong>Scheduled</strong> from the Social hub to see a full list of all upcoming
                social events. Each card shows the event title, date and time, location, cost (if
                any), and seat availability. Tap any card to open the event detail panel.
              </Step>
            </Subsection>

            <Subsection title="Event detail & booking">
              <Step img={IMG("13-social-slideout.png")} alt="Event detail panel">
                The event detail panel slides up from the bottom of the screen and shows everything
                about the event: description, date, time, location (with an offsite address if the
                event is away from the community), coordinator name, bus details if transport is
                running, cost per person, and the seat capacity bar.
              </Step>
              <Step>
                To reserve your place, select the number of seats you need and tap:
              </Step>
              <Step>
                <strong>Book Now</strong> — confirms your booking when seats are available.
              </Step>
              <Step>
                <strong>Join Waitlist</strong> — joins the waitlist when the event is full. You
                will be notified automatically if a space opens up.
              </Step>
              <Step>
                After booking, the panel shows your confirmation with the option to <strong>Modify
                Seats</strong> or <strong>Cancel Booking</strong> — the same as for movie screenings.
              </Step>
            </Subsection>

            <Subsection title="Coordinator panel" ecOnly>
              <Step>
                ECs see the full attendee list inside the event detail panel, with each resident's
                name, seat count, and payment status. ECs can cancel individual bookings or update
                event details directly from this view.
              </Step>
            </Subsection>

          </Section>

          {/* ── 5. BOOK CLUB ── */}
          <Section id="bookclub" num={5} title="Book Club">

            <Subsection title="Book Club home">
              <Step img={IMG("14-bookclub.png")} alt="Book Club home">
                The Book Club section shows the current book pick, upcoming meeting dates, and recent
                suggestions from residents. The current read is displayed prominently at the top with
                the cover, title, and author. If a meeting date has been set, it appears below.
              </Step>
            </Subsection>

            <Subsection title="Signing up & suggestions">
              <Step img={IMG("15-bookclub-suggest.png")} alt="Book suggestions">
                To attend the next Book Club meeting, tap <strong>Sign Up</strong> on the event card.
                This registers your attendance in the same way as any other event — the coordinator
                will see your name on the attendee list.
              </Step>
              <Step>
                Tap <strong>Suggestions</strong> to see books that other residents have put forward
                for the next read. You can vote on suggestions you like or tap{" "}
                <strong>Add suggestion</strong> to propose your own book — search by title and your
                suggestion is sent to the group straight away.
              </Step>
            </Subsection>

          </Section>

          {/* ── 6. BAR ── */}
          <Section id="bar" num={6} title="My Bar — Honour Bar & Tab">

            <Subsection title="The bar menu">
              <Step img={IMG("16-bar.png")} alt="Bar home">
                The community bar operates on an honour system — you record what you take and settle
                your tab at the end of each period. The bar screen shows all available products
                organised by category (beer, wine, spirits, soft drinks, and so on), each with an
                icon, name, brief description, and price.
              </Step>
            </Subsection>

            <Subsection title="Adding to your tab">
              <Step>
                Tap <strong>+ Add to Tab</strong> on any product to record a purchase. A confirmation
                prompt will ask you to enter your <strong>4-digit PIN</strong> to approve the
                charge — this prevents accidental or unauthorised additions. Once confirmed, the
                product is added to your personal tab immediately and a brief confirmation message
                appears at the bottom of the screen.
              </Step>
              <InfoBox>
                💡 If you have not yet set a PIN, go to the account menu (top-right → Change PIN)
                and set one before using the bar. You will not be able to confirm purchases without it.
              </InfoBox>
            </Subsection>

            <Subsection title="Your current tab">
              <Step>
                Below the product menu, you can see your <strong>current open tab</strong> — a list
                of everything you have added since the last reconciliation, with quantities and a
                running total. If there are any previously reconciled periods that have not yet been
                settled, those outstanding amounts are also shown so you have a clear picture of what
                you owe.
              </Step>
            </Subsection>

            <Subsection title="Reconciliation" ecOnly>
              <Step>
                ECs can view all member tabs from the Bar administration panel, mark individual
                amounts as paid, and close reconciliation periods for the whole community. Once a
                period is reconciled, tabs reset to zero for the next period.
              </Step>
            </Subsection>

          </Section>

          {/* ── 7. CALENDAR ── */}
          <Section id="calendar" num={7} title="Community Calendar">
            <Step img={IMG("17-calendar.png")} alt="Community calendar">
              The Calendar brings every upcoming community event together in one view — Movies,
              Social Events, and Book Club meetings all appear here. You can see the full picture of
              what is coming up across every hub without switching between sections.
            </Step>
            <Step>
              Use the filter buttons at the top of the calendar to show or hide events by type — for
              example, show only Movie events or only Social events. You can switch between{" "}
              <strong>Month view</strong> and <strong>Week view</strong> using the view toggle at
              the top.
            </Step>
            <Step>
              Tap any event on the calendar to open its full detail panel — the same booking panel
              you would see from within Movies or Social Events. You can read the full details and
              book your place directly from the calendar.
            </Step>
          </Section>

          {/* ── 8. MY BOOKINGS ── */}
          <Section id="bookings" num={8} title="My Bookings">
            <Step img={IMG("18-bookings.png")} alt="My Bookings screen">
              My Bookings is a single screen that shows all your current reservations across every
              section of the app — Movies, Social Events, and Book Club — in one place. Use the
              filter tabs at the top to narrow the list to a specific hub.
            </Step>
            <Step>
              Each booking card shows the event name, date, time, number of seats, and your current
              status. Tap any card to open the full event detail panel where you can modify seats or
              cancel if your plans change.
            </Step>

            <Subsection title="Understanding booking status">
              <Step>
                <strong style={{ color: "#166534" }}>Confirmed</strong> — your seat is secured. No
                further action is needed unless you want to change the number of seats or cancel.
              </Step>
              <Step>
                <strong style={{ color: "#92400e" }}>Pending Payment</strong> — your booking is
                held but payment has not yet been recorded by the coordinator. Your seat is reserved
                while you sort payment.
              </Step>
              <Step>
                <strong style={{ color: "#64748b" }}>Waitlisted</strong> — the event was full when
                you registered. You are on the waitlist and will receive a notification automatically
                if a confirmed seat opens up. No action is needed — the system handles this for you.
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
