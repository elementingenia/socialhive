"use client"
import { telHref, smsHref } from "@/lib/phone"

// Tap to call / message a phone number (Iain, 2026-10-03). Used on Info >
// Contacts and Info > Interests. One row: the number, then a Call button
// and -- only for a mobile, since landlines can't receive texts -- a
// Message button. Buttons are 40px tall for easy tapping. Plain tel:/sms:
// links, so the phone's own dialler/messages app opens; on a computer the
// browser offers whatever app handles them.
export default function PhoneActions({ phone, colour = "var(--teal)" }) {
  const tel = telHref(phone)
  if (!tel) return null
  const sms = smsHref(phone)
  const btn = {
    display: "inline-flex", alignItems: "center", gap: "0.3rem",
    minHeight: 40, padding: "0 0.85rem", borderRadius: 20,
    border: `1.5px solid ${colour}`, color: colour, background: "var(--surface)",
    fontSize: "0.85rem", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap",
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
      <span style={{ fontSize: "0.85rem", color: "var(--text)", fontWeight: 600, marginRight: "0.15rem" }}>{phone}</span>
      <a href={tel} style={btn} aria-label={`Call ${phone}`}>📞 Call</a>
      {sms && <a href={sms} style={btn} aria-label={`Send a text message to ${phone}`}>💬 Message</a>}
    </div>
  )
}
