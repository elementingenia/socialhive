"use client"
import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { authedFetch } from "@/lib/getAuthToken"
import { formatPhoneInput } from "@/lib/phone"
import { houseNumberInput } from "@/lib/address"
import { useStreets } from "@/lib/useStreets"
import { isBuiltInCategory } from "@/lib/contactCategories"
import { validateAddResident } from "@/lib/addResident"
import StreetPicker from "@/components/StreetPicker"
import { CategoryPicker, inputStyle, labelStyle, COLOUR } from "@/components/ResidentEditPanel"
import { PackPanel } from "@/components/WelcomePackPanel"

// Add Resident (Iain, 2026-11-16): the resident's Contacts details and their
// login in one step, then straight into their welcome pack. Used on Info >
// Contacts, Sign-in Help and the Committee page. Admins and committee get the
// same fields; Admin and Private are set later from Edit Resident (admin
// only). The starting password is generated -- the pack is what hands it
// over. Rules: lib/addResident.js; server: app/api/residents/add.

const hint = { fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "0.3rem" }
const req = <span style={{ color: "var(--danger)" }}>*</span>

export default function AddResidentForm({ onAdded, onClose }) {
  const [name, setName] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [username, setUsername] = useState("")
  const [usernameTouched, setUsernameTouched] = useState(false)
  const [house, setHouse] = useState("")
  const [streetId, setStreetId] = useState(null)
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [title, setTitle] = useState("")
  const [categoryIds, setCategoryIds] = useState([])
  const [categories, setCategories] = useState([])
  const [matches, setMatches] = useState([])
  const [useContactId, setUseContactId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [added, setAdded] = useState(null)   // { name, warning, packError }
  const [pack, setPack] = useState(null)
  const streets = useStreets()

  useEffect(() => {
    supabase.from("contact_categories").select("id, name, display_order").eq("active", true).order("display_order")
      .then(({ data }) => setCategories((data || []).filter(c => !isBuiltInCategory(c.name))))
  }, [])

  // Suggest a username and warn about anyone already on file, once the name
  // (or house number) has been typed.
  async function check() {
    const n = name.trim()
    if (!n && !house) { setMatches([]); return }
    try {
      const r = await authedFetch(`/api/residents/add?name=${encodeURIComponent(n)}&house=${encodeURIComponent(house)}`)
      const d = await r.json()
      if (!r.ok) return
      setMatches(d.matches || [])
      if (!usernameTouched && d.suggestion) setUsername(d.suggestion)
      if (useContactId && !(d.matches || []).some(m => m.id === useContactId && m.canUse)) setUseContactId(null)
    } catch { /* the check is a help, not a gate */ }
  }

  async function save() {
    setError("")
    const problem = validateAddResident({ name, display_name: displayName, username, house_number: house })
    if (problem) { setError(problem); return }
    setSaving(true)
    try {
      const r = await authedFetch("/api/residents/add", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), display_name: displayName.trim() || name.trim(), username: username.trim(),
          house_number: house, street_id: streetId, phone: phone.trim(), email: email.trim(),
          title: title.trim(), category_ids: categoryIds, contact_id: useContactId,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || "Could not add the resident."); setSaving(false); return }
      onAdded && onAdded()
      // Straight on to the welcome pack: this is what gives them their
      // starting password.
      let packError = null
      try {
        const p = await authedFetch("/api/admin/welcome-cards", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "pack", member_ids: [d.member_id] }),
        })
        const pd = await p.json()
        if (!p.ok || !(pd.packs || []).length) packError = pd.error || "The welcome pack could not be made."
        else setPack({ packs: pd.packs, failed: pd.failed || [], count: pd.count || 0, guideUrl: pd.guideUrl, helpLine: pd.helpLine })
      } catch { packError = "The welcome pack could not be made." }
      setAdded({ name: name.trim(), warning: d.warning || null, packError })
    } catch {
      setError("Could not add the resident. Check your connection and try again.")
    }
    setSaving(false)
  }

  if (added) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "0.8rem", fontSize: "0.88rem" }}>
          ✓ {added.name} has been added, with a login.
          {added.warning && <div style={{ color: "#b45309", marginTop: "0.4rem" }}>{added.warning}</div>}
          {added.packError && (
            <div style={{ color: "#b91c1c", marginTop: "0.4rem" }}>
              {added.packError} Make their welcome pack from Sign-in Help: they are listed under Never signed in.
            </div>
          )}
        </div>
        {pack && <PackPanel result={pack} onClose={onClose} />}
        {!pack && (
          <button type="button" onClick={onClose} style={{ ...primaryBtn, background: "var(--surface2)", color: "var(--text)" }}>Done</button>
        )}
      </div>
    )
  }

  const nameMatches = matches.filter(m => m.reason === "name")
  const houseMatches = matches.filter(m => m.reason === "house")

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
      <div style={{ fontSize: "0.83rem", color: "var(--text-dim)" }}>
        Adds the resident to Contacts with a login, then makes their welcome pack to send or print.
      </div>
      <div>
        <label style={labelStyle}>Full name {req}</label>
        <input value={name} onChange={e => setName(e.target.value)} onBlur={check} style={inputStyle} autoComplete="off" />
      </div>
      <div>
        <label style={labelStyle}>Display name</label>
        <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={name.trim() || "Same as full name"} style={inputStyle} />
        <div style={hint}>Shown around the app instead of the full name. Leave blank to use the full name.</div>
      </div>
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 7rem" }}>
          <label style={labelStyle}>House #</label>
          <input value={house} onChange={e => setHouse(houseNumberInput(e.target.value))} onBlur={check} inputMode="numeric" pattern="[0-9]*" style={inputStyle} />
        </div>
        <div style={{ flex: "1 1 10rem", minWidth: 0 }}>
          <StreetPicker streets={streets} value={streetId} onChange={setStreetId} style={inputStyle} label="Street" labelStyle={labelStyle} />
        </div>
      </div>

      {(nameMatches.length > 0 || houseMatches.length > 0) && (
        <div style={{ border: "1px solid #f59e0b", background: "#fffbeb", color: "#78350f", borderRadius: 10, padding: "0.7rem", fontSize: "0.83rem", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
          {nameMatches.length > 0 && <strong>Already on file with this name:</strong>}
          {nameMatches.map(m => (
            <div key={m.kind + m.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ flex: "1 1 10rem" }}>
                {m.name}{m.house_number ? ` · #${m.house_number}` : ""} · {m.kind === "login" ? "has a login" : "in Contacts, no login"}
              </span>
              {m.canUse && (
                <button type="button" onClick={() => setUseContactId(id => id === m.id ? null : m.id)} style={{
                  padding: "0.35rem 0.7rem", borderRadius: 8, fontFamily: "inherit", fontWeight: 700, fontSize: "0.8rem", cursor: "pointer",
                  border: `1px solid ${COLOUR}`, background: useContactId === m.id ? COLOUR : "var(--surface)", color: useContactId === m.id ? "#fff" : COLOUR,
                }}>{useContactId === m.id ? "✓ Using this entry" : "Use this entry"}</button>
              )}
            </div>
          ))}
          {houseMatches.length > 0 && (
            <div>Also at this house: {houseMatches.map(m => m.name).join(", ")}.</div>
          )}
          {useContactId && <div>Their existing Contacts entry gets the login, with the details below. No second entry is made.</div>}
          {!useContactId && nameMatches.some(m => m.kind === "login") && <div>If this is the same person, they already have a login: use Sign-in Help to send them a new welcome pack instead.</div>}
        </div>
      )}

      <div>
        <label style={labelStyle}>Phone</label>
        <input value={phone} onChange={e => setPhone(formatPhoneInput(e.target.value))} type="tel" inputMode="numeric" maxLength={12} placeholder="0400 000 000" style={inputStyle} />
        <div style={hint}>A mobile lets you text them the welcome pack.</div>
      </div>
      <div>
        <label style={labelStyle}>Email</label>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Category</label>
        <div style={{ marginBottom: "0.4rem" }}>
          <span style={{ display: "inline-flex", background: "var(--surface2)", color: "var(--text-dim)", borderRadius: 20, padding: "0.25rem 0.75rem", fontSize: "0.8rem", fontWeight: 600 }}>Residents</span>
        </div>
        <CategoryPicker categories={categories} selectedIds={categoryIds} onChange={setCategoryIds} onCategoryCreated={() => {}} allowCreate={false} />
      </div>
      <div>
        <label style={labelStyle}>Title / Role</label>
        <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Username (for login) {req}</label>
        <input value={username} onChange={e => { setUsername(e.target.value.replace(/\s/g, "")); setUsernameTouched(true) }}
          placeholder="Suggested from the name" style={inputStyle} autoComplete="off" />
        <div style={hint}>What they type to sign in. Their starting password comes in the welcome pack.</div>
      </div>

      {error && <div style={{ color: "#b91c1c", fontSize: "0.85rem", fontWeight: 600 }}>{error}</div>}
      <button type="button" onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.7 : 1, cursor: saving ? "wait" : "pointer" }}>
        {saving ? "Adding…" : "Add resident and make welcome pack"}
      </button>
    </div>
  )
}

const primaryBtn = {
  background: COLOUR, color: "#fff", border: "none", borderRadius: 10, padding: "0.8rem",
  fontWeight: 700, fontSize: "0.95rem", fontFamily: "inherit", width: "100%",
}
