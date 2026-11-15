"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { authedFetch } from "@/lib/getAuthToken"
import { matchesResidentSearch } from "@/lib/welcomeCards"
import {
  DEFAULT_PACK_INTRO, PACK_INTRO_MAX, MAX_PER_PACK_RUN, PACK_MESSAGE_SUBJECT,
  packMessage, smsHrefWithBody, mailtoHref,
} from "@/lib/welcomePack"
import { CreateLoginForm } from "@/components/ResidentEditPanel"
import PdfPages from "@/components/PdfPages"

// Admin › Sign-in Help (Iain, 2026-10-09). Residents who have never signed
// in, sorted by house number for walking round, with a printable welcome
// card each (username, one-time password, QR code to sign in). "Everyone"
// covers reprints for a resident who forgot their password. Printing resets
// that resident's password, so it asks first.
//
// 2026-10-19 (Iain): search by name or house number; the Print action sits in
// a bar fixed above the bottom nav so it's reachable without scrolling; the
// cards come back as one PDF (lib/welcomeCardsPdf.js), not a web page.
//
// 2026-11-15 (Iain, BUG-106): residents added in Contacts with no login yet
// were invisible here. "No login yet" lists them with a Create login button;
// they can't be ticked (no username to print) until the login exists.
//
// 2026-11-16 (Iain): Welcome pack. The card set inside a letter with the
// Home Screen steps, one letter per house, to share, text, email or download
// (lib/welcomePack.js, lib/welcomePackPdf.js). Admins and committee can make
// packs; this same screen is shown on the Committee page, where the server
// lists only residents who have never signed in and offers packs only.

const inputStyle = {
  width: "100%", padding: "0.6rem 0.85rem", borderRadius: 10, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text)", fontSize: "0.92rem", boxSizing: "border-box", fontFamily: "inherit",
}
const heading = { fontSize: "0.72rem", fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 0.5rem" }

function Btn({ children, onClick, tone = "plain", disabled, full }) {
  const tones = {
    primary: { background: "var(--teal)", color: "#fff", border: "1px solid var(--teal)" },
    plain:   { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" },
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      ...tones[tone], borderRadius: 8, padding: full ? "0.75rem 1rem" : "0.35rem 0.7rem",
      fontSize: full ? "0.95rem" : "0.78rem", fontWeight: 700, width: full ? "100%" : undefined,
      fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, minHeight: 34,
    }}>{children}</button>
  )
}

function Pill({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: "0.35rem 0.8rem", borderRadius: 999, fontSize: "0.8rem", fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
      border: `1px solid ${active ? "var(--teal)" : "var(--border)"}`,
      background: active ? "var(--teal)" : "var(--surface)", color: active ? "#fff" : "var(--text)",
    }}>{children}</button>
  )
}

function Tick({ on, onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label} style={{
      width: 26, height: 26, flexShrink: 0, borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
      border: `2px solid ${on ? "var(--teal)" : "var(--border)"}`, background: on ? "var(--teal)" : "var(--surface)",
      color: "#fff", fontSize: "0.9rem", fontWeight: 800, lineHeight: 1, padding: 0,
    }}>{on ? "✓" : ""}</button>
  )
}

// Fixed tray above BottomNav (60px + safe area). The right gutter leaves room
// for the floating Find / Ask buttons, which sit over this corner.
const trayStyle = {
  position: "fixed", left: 0, right: 0, bottom: "calc(60px + env(safe-area-inset-bottom, 0px))",
  background: "var(--surface)", borderTop: "1px solid var(--border)", boxShadow: "0 -4px 14px rgba(0,0,0,0.08)", zIndex: 80,
}
const trayInner = { maxWidth: 720, margin: "0 auto", padding: "0.65rem 84px 0.65rem 16px", display: "flex", flexDirection: "column", gap: "0.5rem" }

function pdfBlob(base64) {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: "application/pdf" })
}
const pdfUrl = (base64) => URL.createObjectURL(pdfBlob(base64))

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
      {pack.residents.map(r => {
        const text = packMessage({ name: r.name, username: r.username, pin: r.pin, loginUrl: r.loginUrl, guideUrl, helpLine })
        const sms = smsHrefWithBody(r.phone, text)
        const mail = mailtoHref(r.email, PACK_MESSAGE_SUBJECT, text)
        return (
          <div key={r.username} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: "0.55rem" }}>
            <div style={{ flex: "1 1 9rem", minWidth: 0, fontSize: "0.85rem" }}>
              <strong>{r.name}</strong> <span style={{ color: "var(--text-dim)" }}>{r.username}</span>
            </div>
            {sms && <a href={sms} style={linkBtn} aria-label={`Text ${r.name}`}>Text</a>}
            {mail && <a href={mail} style={linkBtn} aria-label={`Email ${r.name}`}>Email</a>}
            {!sms && !mail && <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>No mobile or email on file</span>}
          </div>
        )
      })}
      {preview && <PdfPages url={url} onError={() => setPreview(false)} />}
    </div>
  )
}

function PackPanel({ result, onClose }) {
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
      <div><Btn onClick={onClose}>Done</Btn></div>
    </div>
  )
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short" })

export default function WelcomeCardsAdmin({ backHref = "/admin?tab=Residents&sub=SignInHelp" }) {
  const router = useRouter()
  // From the server: true for an admin, false for a committee member (packs
  // only, never-signed-in residents only).
  const [admin, setAdmin] = useState(false)
  const [packIntro, setPackIntro] = useState("")
  const [introDraft, setIntroDraft] = useState("")
  const [packResult, setPackResult] = useState(null)
  const [scope, setScope] = useState("never")
  const [residents, setResidents] = useState(null)
  const [loading, setLoading] = useState(true)
  const [neverCount, setNeverCount] = useState(0)
  const [noLoginCount, setNoLoginCount] = useState(0)
  const [creating, setCreating] = useState(null)
  const [houses, setHouses] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [helpLine, setHelpLine] = useState("")
  const [helpDraft, setHelpDraft] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)
  const [search, setSearch] = useState("")
  const [printError, setPrintError] = useState(null)
  // Set when some residents got no card: the PDF waits in the tray so the
  // "No card for" message is seen before leaving the page (BUG-087).
  const [result, setResult] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await authedFetch(`/api/admin/welcome-cards?scope=${scope}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Could not load residents.")
      setResidents(d.residents); setNeverCount(d.neverCount || 0); setNoLoginCount(d.noLoginCount || 0)
      setHouses(d.houses || null)
      setHelpLine(d.helpLine || ""); setHelpDraft(d.helpLine || "")
      setAdmin(!!d.admin)
      if (d.admin) { setPackIntro(d.packIntro || ""); setIntroDraft(d.packIntro || "") }
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [scope])

  useEffect(() => { setSelected(new Set()); setConfirming(false); setResult(null); setCreating(null); load() }, [load])

  function toggle(id) {
    setConfirming(false); setResult(null); setPrintError(null)
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function saveHelp() {
    setBusy(true); setError(null); setMsg(null)
    try {
      const r = await authedFetch("/api/admin/welcome-cards", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_help", text: helpDraft }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Could not save.")
      setHelpLine(d.helpLine); setHelpDraft(d.helpLine); setMsg("Help line saved.")
    } catch (e) { setError(e.message) }
    setBusy(false)
  }

  async function saveIntro() {
    setBusy(true); setError(null); setMsg(null)
    try {
      const r = await authedFetch("/api/admin/welcome-cards", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_intro", text: introDraft }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Could not save.")
      setPackIntro(d.packIntro); setIntroDraft(d.packIntro); setMsg("Opening paragraph saved.")
    } catch (e) { setError(e.message) }
    setBusy(false)
  }

  function openPdf(url) {
    const q = new URLSearchParams({ url, name: "Welcome cards.pdf", back: backHref })
    router.push(`/documents/view?${q.toString()}`)
  }

  async function makePack() {
    setBusy(true); setPrintError(null); setMsg(null); setResult(null); setPackResult(null)
    try {
      const r = await authedFetch("/api/admin/welcome-cards", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pack", member_ids: [...selected] }) })
      const d = await r.json()
      setConfirming(false); setSelected(new Set())
      if (!r.ok) { load(); throw new Error(d.error || "Could not make the welcome pack.") }
      setPackResult({ packs: d.packs || [], failed: d.failed || [], count: d.count || 0, guideUrl: d.guideUrl, helpLine: d.helpLine })
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
      load()
    } catch (e) { setPrintError(e.message) }
    setBusy(false)
  }

  async function print() {
    setBusy(true); setPrintError(null); setMsg(null); setResult(null)
    try {
      const r = await authedFetch("/api/admin/welcome-cards", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "print", member_ids: [...selected] }) })
      const d = await r.json()
      if (!r.ok) {
        setConfirming(false); setSelected(new Set()); load()
        throw new Error(d.error || "Could not print cards.")
      }
      setConfirming(false); setSelected(new Set())
      const url = d.pdf ? pdfUrl(d.pdf) : null
      if (url && !d.failed?.length) { openPdf(url); return }
      setResult({ url, count: d.count || 0, failed: d.failed || [] })
      load()
    } catch (e) { setPrintError(e.message) }
    setBusy(false)
  }

  const all = residents || []
  const list = all.filter(m => matchesResidentSearch(m, search))
  // Selection survives searching: tick #12, search for #40, tick them too.
  const chosen = all.filter(m => selected.has(m.id))
  const chosenSignedIn = chosen.filter(m => m.signedIn).length
  // Only residents with a login can be ticked for a card.
  const tickable = list.filter(m => !m.noLogin)
  const allOn = tickable.length > 0 && tickable.every(m => selected.has(m.id))
  const trayOpen = chosen.length > 0 || confirming || !!result || !!printError

  function toggleVisible() {
    setConfirming(false); setResult(null); setPrintError(null)
    setSelected(s => {
      const n = new Set(s)
      tickable.forEach(m => allOn ? n.delete(m.id) : n.add(m.id))
      return n
    })
  }
  const helpDirty = helpDraft.trim() !== helpLine.trim()
  const introDirty = introDraft.trim() !== packIntro.trim()
  const tooManyForPack = chosen.length > MAX_PER_PACK_RUN

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <h2 style={{ margin: "0 0 0.25rem", fontSize: "1.15rem" }}>Sign-in Help</h2>
        <div style={{ fontSize: "0.88rem", color: "var(--text-dim)" }}>
          {neverCount} {neverCount === 1 ? "resident has" : "residents have"} never signed in.{" "}
          {noLoginCount > 0 && <><strong>{noLoginCount} more {noLoginCount === 1 ? "has" : "have"} no login yet.</strong>{" "}</>}
          {houses && (houses.total != null
            ? <>Of {houses.total} houses, {houses.occupied} have residents and {houses.empty} {houses.empty === 1 ? "is" : "are"} empty.{" "}
                <strong>{houses.noSignIn} {houses.noSignIn === 1 ? "house with residents has" : "houses with residents have"} nobody signed in yet.</strong>{" "}</>
            : <><strong>{houses.noSignIn} of {houses.occupied} houses with residents</strong> have nobody signed in yet. </>)}
          {admin
            ? <>Print a welcome card for each, or make a <strong>welcome pack</strong>: the card inside a letter that shows how to put the app on their Home Screen, to send or print.</>
            : <>Tick a resident and make a <strong>welcome pack</strong>: a letter with their username, a starting password and how to put the app on their Home Screen, to send or print.</>}
          {" "}They choose their own password when they first sign in.
        </div>
      </div>

      {packResult && <PackPanel result={packResult} onClose={() => setPackResult(null)} />}

      {admin && (
        <div>
          <div style={heading}>“Need help?” line on the card and pack</div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input value={helpDraft} onChange={e => setHelpDraft(e.target.value)} maxLength={120}
              placeholder="e.g. Ask Iain, house 77, 0400 000 000" style={inputStyle} />
            <Btn tone="primary" onClick={saveHelp} disabled={busy || !helpDirty}>Save</Btn>
          </div>
          {!helpLine && <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: "0.3rem" }}>Leave empty and the card has no help line.</div>}
        </div>
      )}

      {admin && (
        <div>
          <div style={heading}>Welcome pack opening paragraph</div>
          <textarea value={introDraft} onChange={e => setIntroDraft(e.target.value)} maxLength={PACK_INTRO_MAX} rows={4}
            placeholder={DEFAULT_PACK_INTRO} aria-label="Welcome pack opening paragraph"
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.4 }} />
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.35rem" }}>
            <div style={{ flex: 1, fontSize: "0.78rem", color: "var(--text-dim)" }}>
              {packIntro ? "Printed under “Welcome” on every pack." : "Leave empty and the pack uses the standard wording shown in grey."}
            </div>
            <Btn tone="primary" onClick={saveIntro} disabled={busy || !introDirty}>Save</Btn>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <Pill active={scope === "never"} onClick={() => setScope("never")}>Never signed in ({neverCount})</Pill>
        <Pill active={scope === "houses"} onClick={() => setScope("houses")}>Houses with no sign-in ({houses?.noSignIn ?? 0})</Pill>
        {admin && <Pill active={scope === "nologin"} onClick={() => setScope("nologin")}>No login yet ({noLoginCount})</Pill>}
        {admin && <Pill active={scope === "all"} onClick={() => setScope("all")}>Everyone</Pill>}
        {tickable.length > 0 && (
          <span style={{ marginLeft: "auto" }}>
            <Btn onClick={toggleVisible}>
              {allOn ? (search.trim() ? "Untick these" : "Clear") : (search.trim() ? `Select these ${tickable.length}` : "Select all")}
            </Btn>
          </span>
        )}
      </div>

      <div style={{ position: "relative" }}>
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} enterKeyHint="search"
          placeholder="Find by name or house number" aria-label="Find a resident by name or house number"
          style={{ ...inputStyle, paddingRight: search ? "2.4rem" : undefined }} />
        {search && (
          <button type="button" onClick={() => setSearch("")} aria-label="Clear search" style={{
            position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 30, height: 30,
            border: "none", background: "transparent", color: "var(--text-dim)", fontSize: "1.1rem", cursor: "pointer", fontFamily: "inherit",
          }}>✕</button>
        )}
      </div>

      {error && <div style={{ color: "#e53e3e", fontSize: "0.85rem" }}>{error}</div>}
      {msg && <div style={{ color: "var(--teal)", fontSize: "0.85rem" }}>{msg}</div>}

      {loading ? (
        <div style={{ fontSize: "0.88rem", color: "var(--text-dim)" }}>Loading residents…</div>
      ) : list.length === 0 ? (
        <div style={{ fontSize: "0.9rem", color: "var(--text-dim)" }}>
          {all.length > 0 && search.trim()
            ? `No ${scope === "never" ? "never-signed-in " : ""}resident ${scope === "houses" ? "in these houses " : scope === "nologin" ? "without a login " : ""}matches “${search.trim()}”.${scope === "all" || !admin ? "" : " Try Everyone."}`
            : scope === "never" ? "Everyone has signed in at least once."
            : scope === "nologin" ? "Every resident in Contacts has a login."
            : scope === "houses" ? "Every house has at least one resident signed in." : "No residents found."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {scope === "nologin" && (
            <div style={{ fontSize: "0.82rem", color: "var(--text-dim)" }}>
              These residents are in Contacts but have no login, so they can&apos;t sign in or be given a card yet.
              Create a login and they move to Never signed in, ready for a card.
            </div>
          )}
          {list.map(m => m.noLogin ? (
            <div key={m.id} style={{
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "0.55rem 0.75rem",
              display: "flex", flexDirection: "column", gap: "0.6rem",
            }}>
              <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>
                    {m.house_number ? `#${m.house_number} · ` : ""}{m.name}
                  </div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--amber)" }}>No login yet</div>
                </div>
                <Btn onClick={() => setCreating(c => c === m.id ? null : m.id)}>{creating === m.id ? "Cancel" : "Create login"}</Btn>
              </div>
              {creating === m.id && (
                <CreateLoginForm defaultName={m.name} contactId={m.contactId} onCreated={() => {
                  setCreating(null); setError(null)
                  setMsg(`Login created for ${m.name}. They are now under Never signed in, ready for a card.`)
                  load()
                }} />
              )}
            </div>
          ) : (
            <div key={m.id} onClick={() => toggle(m.id)} style={{
              display: "flex", gap: "0.65rem", alignItems: "center", cursor: "pointer",
              background: "var(--surface)", border: `1px solid ${selected.has(m.id) ? "var(--teal)" : "var(--border)"}`,
              borderRadius: 12, padding: "0.55rem 0.75rem",
            }}>
              <Tick on={selected.has(m.id)} onClick={e => { e.stopPropagation(); toggle(m.id) }} label={`Select ${m.name}`} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>
                  {m.house_number ? `#${m.house_number} · ` : ""}{m.name}
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span>{m.username}</span>
                  {m.printedAt && <span>Card printed {fmtDate(m.printedAt)}{m.printedBy ? ` by ${m.printedBy}` : ""}</span>}
                </div>
              </div>
              {m.signedIn
                ? <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--teal)", flexShrink: 0 }}>Signed in</span>
                : m.printedAt && <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--amber)", flexShrink: 0 }}>Not yet</span>}
            </div>
          ))}
        </div>
      )}

      {trayOpen && <div aria-hidden style={{ height: confirming ? 190 : 110 }} />}

      {trayOpen && (
        <div style={trayStyle}>
          <div style={trayInner}>
            {printError && <div style={{ color: "#e53e3e", fontSize: "0.85rem", fontWeight: 600 }}>{printError}</div>}

            {result && (
              <>
                {result.failed.length > 0 && (
                  <div style={{ color: "#e53e3e", fontSize: "0.85rem", fontWeight: 600 }}>
                    No card for: {result.failed.join(", ")}. Their password was not changed. Print again for {result.failed.length === 1 ? "them" : "these residents"}.
                  </div>
                )}
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {result.url && <Btn tone="primary" onClick={() => openPdf(result.url)}>Open {result.count} card{result.count === 1 ? "" : "s"} (PDF)</Btn>}
                  <Btn onClick={() => setResult(null)}>Close</Btn>
                </div>
              </>
            )}

            {!result && chosen.length > 0 && !confirming && (
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", flexShrink: 0 }}>{chosen.length} ticked</div>
                <Btn onClick={() => { setSelected(new Set()); setPrintError(null) }}>Clear</Btn>
                <div style={{ flex: 1, display: "flex", gap: "0.5rem" }}>
                  {admin && (
                    <div style={{ flex: 1 }}>
                      <Btn full onClick={() => { setPrintError(null); setConfirming("cards") }}>
                        Print {chosen.length} card{chosen.length === 1 ? "" : "s"}
                      </Btn>
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <Btn tone="primary" full onClick={() => { setPrintError(null); setConfirming("pack") }}>Welcome pack</Btn>
                  </div>
                </div>
              </div>
            )}

            {!result && confirming === "pack" && chosen.length > 0 && (
              <>
                <div style={{ fontSize: "0.88rem" }}>
                  {tooManyForPack
                    ? <>Make packs for at most {MAX_PER_PACK_RUN} residents at a time. Untick some and try again.</>
                    : <>A welcome pack gives {chosen.length === 1 ? "this resident" : `these ${chosen.length} residents`} a new starting password.
                        {chosenSignedIn > 0 && <> <strong>{chosenSignedIn} already {chosenSignedIn === 1 ? "signs" : "sign"} in</strong>: their current password will stop working.</>}
                        {" "}Residents of the same house share one letter with a card each. You can then share, text, email or download it.</>}
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Btn tone="primary" onClick={makePack} disabled={busy || tooManyForPack}>{busy ? "Making…" : "Yes, make the pack"}</Btn>
                  <Btn onClick={() => setConfirming(false)} disabled={busy}>Cancel</Btn>
                </div>
              </>
            )}

            {!result && confirming === "cards" && chosen.length > 0 && (
              <>
                <div style={{ fontSize: "0.88rem" }}>
                  Printing gives {chosen.length === 1 ? "this resident" : `these ${chosen.length} residents`} a new starting password.
                  {chosenSignedIn > 0 && <> <strong>{chosenSignedIn} already {chosenSignedIn === 1 ? "signs" : "sign"} in</strong>: their current password will stop working.</>}
                  {" "}The cards open as one PDF: print on A4, cut along the dashed lines, and hand each card to the resident or put it in their letterbox.
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Btn tone="primary" onClick={print} disabled={busy}>{busy ? "Printing…" : "Yes, print"}</Btn>
                  <Btn onClick={() => setConfirming(false)} disabled={busy}>Cancel</Btn>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
