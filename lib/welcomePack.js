// Welcome pack (Iain, 2026-11-16, scope:
// claude/Element_Happenings_Welcome_Pack_Scope_Answered.md). The welcome card
// set inside a letter that explains putting the app on the Home Screen: one
// letter per house, a card for each resident in it. It can be shared, texted,
// emailed or downloaded as a finished PDF. Making a pack issues a fresh
// one-time password, exactly like printing a card.
//
// Pure rules and wording only (no DB, no PDF) so the route, the screen, the
// help guide, lib/welcomePackPdf.js and the unit tests all share one copy.

import { houseKey, sortForWalking, firstName } from "./welcomeCards.js"
import { isMobileNumber, phoneDigits, formatPhoneInput } from "./phone.js"

export const PACK_INTRO_KEY = "welcome_pack_intro"
export const PACK_INTRO_MAX = 600
export const MAX_PER_PACK_RUN = 12

// Used when no admin has written their own opening paragraph.
export const DEFAULT_PACK_INTRO =
  "Welcome to Element Happenings, the village's own app for events, bookings and news. " +
  "All you really need it for is booking into events, but there is plenty more to explore. " +
  "Your username and one-time password are on your card below. " +
  "You will choose your own password the first time you sign in."

/** What an admin typed, trimmed and capped. Line breaks kept (paragraphs). */
export function cleanPackIntro(text) {
  return String(text || "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, PACK_INTRO_MAX)
}

/** The paragraph that goes on the letter: the admin's, or the standard one. */
export function packIntroText(saved) {
  return cleanPackIntro(saved) || DEFAULT_PACK_INTRO
}

// Decision 2: Home Screen first, then sign in from the new icon. On iPhone
// Safari and the Home Screen app keep separate sign-ins (BUG-073), so signing
// in first would mean signing in twice.
export const PACK_STEP_TITLES = [
  "Open the website",
  "Put the app on your Home Screen",
  "Sign in and choose your own password",
]

export const HOME_SCREEN_LEAD =
  "This puts an Element Happenings icon on your phone or tablet, so it opens with one tap like any other app. " +
  "It takes a minute and you only do it once."

// icon: which little picture sits beside the step (drawn by the PDF).
// iOS 26 moved Share behind the three dots in Safari's default layout; older
// iPhones and iPads still show the Share icon itself, so both are named.
export const IPHONE_STEPS = [
  { text: "Make sure the website is open in Safari." },
  { text: "Tap the three dots at the bottom of the screen, then tap Share. On an older iPhone, or on an iPad, tap the Share icon instead: a square with an arrow pointing up.", icon: "share" },
  { text: "Scroll down the list and tap Add to Home Screen.", icon: "plus" },
  { text: "Tap Add in the top right corner.", icon: "check" },
  { text: "The Element Happenings icon is now on your Home Screen." },
]

export const ANDROID_STEPS = [
  { text: "Make sure the website is open in Chrome." },
  { text: "Tap the three dots in the top right corner of the screen.", icon: "dots" },
  { text: "Tap Add to Home screen. On some phones it says Install app.", icon: "plus" },
  { text: "Tap Install or Add to confirm.", icon: "check" },
  { text: "The Element Happenings icon is now on your Home Screen." },
]

export const SIGN_IN_STEPS = [
  "Tap the new Element Happenings icon on your Home Screen.",
  "Enter the username and one-time password from your card, then tap Sign In.",
  "Choose your own new password. Keep it somewhere safe.",
]

export const GOOD_TO_KNOW = [
  "This does not use up storage space. The icon is a shortcut that opens the website like an app.",
  "Use Safari on an iPhone or iPad, and Chrome on an Android phone. The steps are different in other browsers.",
  "Stuck? Ask a family member to help, or get in touch and we will walk you through it.",
]

export const PACK_TIPS = [
  { title: "Tap Join", text: "Show Time and every Group or Club has a Join button. Once you have joined, you are told about new events and notices there." },
  { title: "Running something yourself?", text: "If you are organising something other residents are welcome at, ask an admin to set it up as an event in the app. You look after who is coming and can send them messages." },
]

/** "Susie", "Susie and John", "Ann, Bob and Cy". */
export function joinNames(names) {
  const list = (names || []).map(n => String(n || "").trim()).filter(Boolean)
  if (list.length <= 1) return list[0] || ""
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`
}

/**
 * One pack per house (decision 4): residents sharing a house number go on one
 * letter. A resident with no house number gets a letter of their own.
 * Returns [{ key, house, residents }] in walking order.
 */
export function groupByHouse(cards) {
  const groups = new Map()
  for (const c of sortForWalking(cards || [])) {
    const house = houseKey(c)
    const key = house ? `h-${house}` : `m-${c.id ?? c.username}`
    if (!groups.has(key)) groups.set(key, { key, house, residents: [] })
    groups.get(key).residents.push(c)
  }
  return [...groups.values()]
}

/** "House 49" when there is one, else the residents' names. */
export function packTitle(group) {
  if (group?.house) return `House ${group.house}`
  return joinNames((group?.residents || []).map(r => r.name)) || "Resident"
}

export function packGreeting(group) {
  const names = (group?.residents || []).map(r => firstName(r.name) || r.name).filter(Boolean)
  return names.length ? `Welcome, ${joinNames(names)}` : "Welcome"
}

/** Download name. Only letters, digits, spaces and dashes survive. */
export function packFileName(group) {
  const safe = packTitle(group).replace(/[^a-zA-Z0-9 -]/g, "").replace(/\s+/g, " ").trim() || "Resident"
  return `Welcome pack - ${safe}.pdf`
}

/** The public help-guide section with the Home Screen steps. */
export function homeScreenGuideUrl(origin) {
  return `${String(origin || "").replace(/\/+$/, "")}/help-guide#sub-home-screen`
}

export const PACK_MESSAGE_SUBJECT = "Welcome to Element Happenings"

/**
 * The text or email an admin sends from their own phone. A pre-filled message
 * cannot carry the PDF, so it holds what the resident needs on its own: the
 * sign-in link, their username and one-time password, and where the Home
 * Screen steps are.
 */
export function packMessage({ name, username, pin, loginUrl, guideUrl, helpLine } = {}) {
  const hello = firstName(name)
  const help = String(helpLine || "").trim()
  return [
    `Hi${hello ? ` ${hello}` : ""}, welcome to Element Happenings.`,
    "",
    `Sign in here: ${loginUrl}`,
    `Username: ${username}`,
    `One-time password: ${pin}`,
    "",
    "You will choose your own password the first time you sign in.",
    guideUrl ? `How to put the app on your Home Screen: ${guideUrl}` : null,
    help ? "" : null,
    help ? `Need help? ${help}` : null,
  ].filter(l => l !== null).join("\n")
}

/**
 * sms: link with the message filled in. "?&body=" is the form both iPhone
 * and Android accept. Null for a landline or no number (can't take a text).
 */
export function smsHrefWithBody(phone, body) {
  if (!isMobileNumber(phone)) return null
  return `sms:${phoneDigits(phone)}?&body=${encodeURIComponent(body || "")}`
}

export function mailtoHref(email, subject, body) {
  const to = String(email || "").trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return null
  return `mailto:${to}?subject=${encodeURIComponent(subject || "")}&body=${encodeURIComponent(body || "")}`
}

/**
 * Who a committee member (not an admin) may make a pack for: residents who
 * have never signed in, and never an admin or a Private resident. A pack
 * resets the password and shows the new one, so anything wider would let a
 * committee member take over an account that is already in use.
 */
export function committeeMayPack(member, hasSignedIn) {
  return !!member && member.status === "active" && !member.is_test &&
    !member.is_admin && !member.hide_name && !hasSignedIn
}

/**
 * Mobile and email typed into a pack row (Iain, 2026-11-19): adding or
 * correcting them there lets the pack be texted or emailed, and saves them to
 * the resident's record. Only the fields given are checked; a blank field
 * means "leave as it is" -- this screen adds or corrects, it never clears.
 * Returns { fields } (phone stored 4-3-3) or { error }.
 */
export const PACK_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function cleanPackContact({ phone, email } = {}) {
  const fields = {}
  const p = String(phone ?? "").trim()
  if (p) {
    if (!isMobileNumber(p)) return { error: "Enter a mobile number, for example 0412 345 678." }
    fields.phone = formatPhoneInput(phoneDigits(p).replace(/^\+?61/, "0"))
  }
  const e = String(email ?? "").trim()
  if (e) {
    if (e.length > 200 || !PACK_EMAIL_RE.test(e)) return { error: "Enter a full email address, for example name@example.com." }
    fields.email = e
  }
  if (!Object.keys(fields).length) return { error: "Enter a mobile number or an email address." }
  return { fields }
}
