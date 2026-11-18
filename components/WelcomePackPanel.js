"use client"
import { useState, useEffect, useMemo } from "react"
import { PACK_MESSAGE_SUBJECT, packMessage, smsHrefWithBody, mailtoHref, cleanPackContact } from "@/lib/welcomePack"
import { formatPhoneInput } from "@/lib/phone"
import { authedFetch } from "@/lib/getAuthToken"
import PdfPages from "@/components/PdfPages"

// Welcome pack results (Iain, 2026-11-16): Share PDF, Download, Preview, and
// Text / Email per resident. Moved out of WelcomeCardsAdmin so Add Resident
// can show the same panel straight after a resident is added.

export function pdfBlob(base64) {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: "application/pdf" })
}

const linkBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 40, padding: "0 0.9rem",
  borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
  fontSize: "0.85rem", fontWeight: 700, textDecoration: "none", fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
}
const linkBtnPrimary = { ...linkBtn, background: "var(--teal)", color: "#fff", border: "1px solid var(--teal)" }

// One house's pack: send it or save it. Share hands the PDF to the phone's
// own share sheet (Messages, Mail, WhatsApp). Text and Email open a message
// already written, with the sign-in link, username and one-time password --
// a pre-filled message can't carry the PDF itself.
function PackRow({ pack, guideUrl, helpLine }) {
  const [preview, setPreview] = useState(false)
  const [shareError, setShareError] = useState(null)
  const { url, file } = useMemo(() => {
    const blob = pdfBlob(pack.pdf)
    return {
      url: URL.createObjectURL(blob),
      file: typeof File !== "undefined" ? new File([blob], pack.fileName, { type: "application/pdf" }) : null,
    }
  }, [pack])
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  let canShare = false
  try { canShare = !!file && typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files: [file] }) } catch { canShare = false }

  async function share() {
    setShareError(null)
    try { await navigator.share({ files: [file], title: `Element Happenings welcome pack - ${pack.title}` }) }
    catch (e) { if (e?.name !== "AbortError") setShareError("Sharing did not open on this device. Download the PDF and attach it instead.") }
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "0.7rem 0.8rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
        {pack.title}
        <span style={{ fontWeight: 500, color: "var(--text-dim)" }}> · {pack.residents.map(r => r.name).join(", ")}</span>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {canShare && <button type="button" onClick={share} style={linkBtnPrimary}>Share PDF</button>}
        <a href={url} download={pack.fileName} style={canShare ? linkBtn : linkBtnPrimary}>Download PDF</a>
        <button type="button" onClick={() => setPreview(v => !v)} style={linkBtn}>{preview ? "Hide preview" : "Preview"}</button>
      </div>
      {!canShare && (
        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
          This device can&apos;t share a file straight to a message. Download the PDF and attach it, or use Text / Email below.
        </div>
      )}
      {shareError && <div style={{ color: "#e53e3e", fontSize: "0.82rem", fontWeight: 600 }}>{shareError}</div>}
      {pack.residents.map(r => (
        <ResidentSendRow key={r.username} resident={r} guideUrl={guideUrl} helpLine={helpLine} />
      ))}
      {preview && <PdfPages url={url} onError={() => setPreview(false)} />}
    </div>
  )
}

const fieldStyle = {
  flex: "1 1 10rem", minWidth: 0, padding: "0.55rem 0.7rem", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text)", fontSize: "0.9rem", fontFamily: "inherit", boxSizing: "border-box",
  appearance: "none", WebkitAppearance: "none",
}

// One resident in a pack (Iain, 2026-11-19): mobile and email can be added
// or corrected here. Save writes them to the resident's record, then Text /
// Email use them. Text and Email only show for saved details, so what is
// sent always matches what is on file.
function ResidentSendRow({ resident: r, guideUrl, helpLine }) {
  const [saved, setSaved] = useState({ phone: r.phone || "", email: r.email || "" })
  const [phone, setPhone] = useState(r.phone || "")
  const [email, setEmail] = useState(r.email || "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)

  const changed = {}
  if (phone.trim() && phone.trim() !== saved.phone) changed.phone = phone
  if (email.trim() && email.trim() !== saved.email) changed.email = email
  const dirty = Object.keys(changed).length > 0

  async function save() {
    setError(null); setNote(null)
    const check = cleanPackContact(changed)
    if (check.error) { setError(check.error); return }
    setBusy(true)
    try {
      const res = await authedFetch("/api/admin/welcome-cards", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_contact", member_id: r.id, ...changed }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || "Could not save.")
      const next = { phone: d.phone || "", email: d.email || "" }
      setSaved(next); setPhone(next.phone); setEmail(next.email)
      setNote("Saved to their profile.")
    } catch (e) { setError(e.message) }
    setBusy(false)
  }

  const text = packMessage({ name: r.name, username: r.username, pin: r.pin, loginUrl: r.loginUrl, guideUrl, helpLine })
  const sms = smsHrefWithBody(saved.phone, text)
  const mail = mailtoHref(saved.email, PACK_MESSAGE_SUBJECT, text)
  const canEdit = !!r.id

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", borderTop: "1px solid var(--border)", paddingTop: "0.55rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 9rem", minWidth: 0, fontSize: "0.85rem" }}>
          <strong>{r.name}</strong> <span style={{ color: "var(--text-dim)" }}>{r.username}</span>
        </div>
        {!dirty && sms && <a href={sms} style={linkBtn} aria-label={`Text ${r.name}`}>Text</a>}
        {!dirty && mail && <a href={mail} style={linkBtn} aria-label={`Email ${r.name}`}>Email</a>}
      </div>
      {canEdit && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input type="tel" inputMode="numeric" value={phone} placeholder="Mobile"
            onChange={e => { setPhone(formatPhoneInput(e.target.value)); setNote(null) }}
            aria-label={`Mobile for ${r.name}`} style={fieldStyle} />
          <input type="email" value={email} placeholder="Email" autoCapitalize="none" autoCorrect="off"
            onChange={e => { setEmail(e.target.value); setNote(null) }}
            aria-label={`Email for ${r.name}`} style={fieldStyle} />
          {dirty && (
            <button type="button" onClick={save} disabled={busy} style={{ ...linkBtnPrimary, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      )}
      {dirty && !error && <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>Save to update their profile and send to these details.</div>}
      {!dirty && !sms && !mail && !note && <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>No mobile or email on file. Add one above to text or email the pack details.</div>}
      {note && <div style={{ fontSize: "0.78rem", color: "var(--teal)", fontWeight: 600 }}>{note}</div>}
      {error && <div style={{ color: "#e53e3e", fontSize: "0.82rem", fontWeight: 600 }}>{error}</div>}
    </div>
  )
}

export function PackPanel({ result, onClose }) {
  const { packs, failed, count, guideUrl, helpLine } = result
  return (
    <div style={{ border: "2px solid var(--teal)", borderRadius: 14, padding: "0.8rem", display: "flex", flexDirection: "column", gap: "0.7rem", background: "var(--bg)" }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: "1rem" }}>
          {packs.length === 1 ? "Welcome pack ready" : `${packs.length} welcome packs ready`}
        </div>
        <div style={{ fontSize: "0.82rem", color: "var(--text-dim)" }}>
          {count} {count === 1 ? "resident has" : "residents have"} a new starting password. Send or download now:
          the passwords are only shown here and are gone once you close this or leave the page.
          Text and Email send the sign-in details as a message. Only Share and Download include the PDF.
        </div>
      </div>
      {failed.length > 0 && (
        <div style={{ color: "#e53e3e", fontSize: "0.85rem", fontWeight: 600 }}>
          No pack for: {failed.join(", ")}. Their password was not changed.
        </div>
      )}
      {packs.map(p => <PackRow key={p.key} pack={p} guideUrl={guideUrl} helpLine={helpLine} />)}
      <div><button type="button" onClick={onClose} style={linkBtn}>Done</button></div>
    </div>
  )
}

