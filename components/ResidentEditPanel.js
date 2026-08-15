"use client"
import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { getAuthToken } from "@/lib/getAuthToken"
import { formatPhoneInput } from "@/lib/phone"
import { isValidDisplayName } from "@/lib/memberName"

export const COLOUR = "#4e7aab"

export const inputStyle = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: 10,
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box",
  fontFamily: "inherit", appearance: "none", WebkitAppearance: "none",
}

export const labelStyle = {
  fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)",
  textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, display: "block",
}

export const readOnlyStyle = { ...inputStyle, background: "var(--surface2)", color: "var(--text-dim)" }

export async function getToken() {
  // Delegates to the shared helper (2026-07-14) -- this used to be a plain
  // getSession() with no expiry check, same as the bug found and fixed in
  // EventSlideOut.js's Coordinator View and the Screenings list. Imported by
  // Admin, Info>Contacts, Info>Documents, and Book Club, so fixing it once
  // here closes the gap for all four instead of patching each call site.
  return getAuthToken()
}

// ── Bottom sheet ────────────────────────────────────────────────────────────
// Header is sticky (2026-07-24, Iain: on a tall form/picker he couldn't
// scroll back up far enough to reach Close, on a phone screen) -- it now
// stays pinned to the top of the sheet regardless of scroll position, so
// Sheet now lives in components/Sheet.js (extracted 2026-07-27) and is
// re-exported here so existing importers are unaffected.
export { Sheet } from "@/components/Sheet"

// ── Category multi-select combobox — search existing, or create inline ────────
export function CategoryPicker({ categories, selectedIds, onChange, onCategoryCreated, allowCreate = true, required = false }) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const selected = categories.filter(c => selectedIds.includes(c.id))
  const q = query.trim().toLowerCase()
  const matches = categories.filter(c => !selectedIds.includes(c.id) && (!q || c.name.toLowerCase().includes(q)))
  const exactMatch = categories.some(c => c.name.toLowerCase() === q)

  function addCategory(id) {
    onChange([...selectedIds, id])
    setQuery("")
  }
  function removeCategory(id) {
    onChange(selectedIds.filter(x => x !== id))
  }

  async function createAndAdd() {
    if (!query.trim() || creating) return
    setCreating(true)
    const token = await getToken()
    const res = await fetch("/api/info/contact-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ name: query.trim() }),
    })
    const data = await res.json()
    setCreating(false)
    if (res.ok) {
      onCategoryCreated(data)
      onChange([...selectedIds, data.id])
      setQuery("")
    }
  }

  return (
    <div>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem" }}>
          {selected.map(c => (
            <span key={c.id} style={{
              display: "inline-flex", alignItems: "center", gap: "0.35rem",
              background: COLOUR, color: "#fff", borderRadius: 20,
              padding: "0.25rem 0.5rem 0.25rem 0.75rem", fontSize: "0.8rem", fontWeight: 600,
            }}>
              {c.name}
              <button type="button" onClick={() => removeCategory(c.id)} style={{
                background: "none", border: "none", color: "#fff", cursor: "pointer",
                fontSize: "0.9rem", lineHeight: 1, padding: 0, opacity: 0.8, fontFamily: "inherit",
              }}>×</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: "relative" }}>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={selected.length ? "Add another category…" : "Search or add a category…"}
          style={{ ...inputStyle, border: `1.5px solid ${required && selected.length === 0 ? "var(--danger)" : "var(--border)"}` }}
        />
        {open && (matches.length > 0 || (allowCreate && q && !exactMatch)) && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
            boxShadow: "var(--shadow)", maxHeight: 200, overflowY: "auto",
          }}>
            {matches.map(c => (
              <button key={c.id} type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => addCategory(c.id)}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "0.6rem 0.85rem",
                  background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                  fontSize: "0.88rem", color: "var(--text)",
                }}>{c.name}</button>
            ))}
            {allowCreate && q && !exactMatch && (
              <button type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={createAndAdd} disabled={creating}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "0.6rem 0.85rem",
                  background: "none", border: "none", borderTop: matches.length ? "1px solid var(--border)" : "none",
                  cursor: creating ? "not-allowed" : "pointer", fontFamily: "inherit",
                  fontSize: "0.88rem", color: COLOUR, fontWeight: 600,
                }}>{creating ? "Adding…" : `+ Create "${query.trim()}"`}</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Admin login controls (2026-07-16) ────────────────────────────────────────
// Shared by the member editor (Reset PIN), the standalone-contact editor
// (Create login = promote to a real account), and the Add Resident sheet.
// All call the admin-only /api/admin/accounts route.
const smallInput = { ...inputStyle, padding: "0.55rem 0.75rem", fontSize: "0.9rem" }

export function ResetPinControl({ memberId, username }) {
  const [open, setOpen]   = useState(false)
  const [pin, setPin]     = useState("")
  const [busy, setBusy]   = useState(false)
  const [msg, setMsg]     = useState(null)
  const [err, setErr]     = useState("")

  async function submit() {
    setBusy(true); setErr(""); setMsg(null)
    const token = await getToken()
    const res = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "reset_pin", member_id: memberId, pin }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setErr(data.error || "Reset failed"); return }
    setMsg(`PIN reset — tell them their new PIN is “${pin}”.`)
    setPin(""); setOpen(false)
  }

  return (
    <div style={{ marginTop: "0.6rem" }}>
      {!open ? (
        <button type="button" onClick={() => { setOpen(true); setMsg(null) }} style={{
          padding: "0.35rem 0.75rem", borderRadius: 8, border: "1px solid var(--border)",
          background: "var(--surface)", color: "var(--text-dim)", fontSize: "0.8rem",
          fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
        }}>🔑 Reset PIN</button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <label style={labelStyle}>New PIN{username ? ` for ${username}` : ""}</label>
          <input value={pin} onChange={e => setPin(e.target.value)} placeholder="At least 4 characters" style={smallInput} />
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <button type="button" onClick={submit} disabled={busy || pin.length < 4} style={{
              flex: 1, padding: "0.45rem", borderRadius: 8, border: "none", background: COLOUR, color: "#fff",
              fontWeight: 700, fontSize: "0.85rem", fontFamily: "inherit", cursor: (busy || pin.length < 4) ? "not-allowed" : "pointer", opacity: (busy || pin.length < 4) ? 0.6 : 1,
            }}>{busy ? "Saving…" : "Set PIN"}</button>
            <button type="button" onClick={() => { setOpen(false); setPin(""); setErr("") }} style={{
              padding: "0.45rem 0.75rem", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--surface2)", color: "var(--text)", fontSize: "0.85rem", fontFamily: "inherit", cursor: "pointer",
            }}>Cancel</button>
          </div>
        </div>
      )}
      {err && <div style={{ color: "#b91c1c", fontSize: "0.8rem", marginTop: "0.3rem" }}>{err}</div>}
      {msg && <div style={{ color: "var(--green)", fontSize: "0.8rem", marginTop: "0.3rem" }}>{msg}</div>}
    </div>
  )
}

export function CreateLoginForm({ defaultName = "", contactId = null, onCreated }) {
  const [name, setName]         = useState(defaultName)
  const [username, setUsername] = useState("")
  const [pin, setPin]           = useState("")
  const [busy, setBusy]         = useState(false)
  const [err, setErr]           = useState("")
  const [done, setDone]         = useState(null)

  async function submit() {
    setBusy(true); setErr("")
    const token = await getToken()
    const res = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "create_account", name, username, pin, contact_id: contactId }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setErr(data.error || "Could not create login"); return }
    setDone({ username, pin })
    if (onCreated) onCreated(data)
  }

  if (done) {
    return (
      <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "0.85rem", fontSize: "0.88rem", color: "var(--text)" }}>
        ✓ Login created. Give them these to sign in — they can change the PIN later from their profile.
        <div style={{ marginTop: "0.5rem" }}><strong>Username:</strong> {done.username}<br /><strong>PIN:</strong> {done.pin}</div>
      </div>
    )
  }

  const valid = name.trim() && username.trim().length >= 3 && pin.length >= 4
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <div>
        <label style={labelStyle}>Name <span style={{ color: "var(--danger)" }}>*</span></label>
        <input value={name} onChange={e => setName(e.target.value)} style={smallInput} />
      </div>
      <div>
        <label style={labelStyle}>Username <span style={{ color: "var(--danger)" }}>*</span></label>
        <input value={username} onChange={e => setUsername(e.target.value.replace(/\s/g, ""))} placeholder="What they type to log in" style={smallInput} />
      </div>
      <div>
        <label style={labelStyle}>Starting PIN <span style={{ color: "var(--danger)" }}>*</span></label>
        <input value={pin} onChange={e => setPin(e.target.value)} placeholder="At least 4 characters" style={smallInput} />
      </div>
      {err && <div style={{ color: "#b91c1c", fontSize: "0.83rem" }}>{err}</div>}
      <button onClick={submit} disabled={busy || !valid} style={{
        background: COLOUR, color: "#fff", border: "none", borderRadius: 10, padding: "0.7rem",
        fontWeight: 700, fontSize: "0.92rem", fontFamily: "inherit", cursor: (busy || !valid) ? "not-allowed" : "pointer", opacity: (busy || !valid) ? 0.6 : 1,
      }}>{busy ? "Creating…" : "Create Login"}</button>
    </div>
  )
}

// ── Edit a resident's contact-card overrides (+ account flags) ────────────────
// Single shared editor used from BOTH the Info > Contacts page and Admin >
// Members tab, so there is exactly one implementation and one API call path
// for "everything about this person" — not two copies that can drift apart.
// Rename a login. Only possible since migration 066 decoupled the Auth email
// from the username -- before that a rename orphaned the Auth user and locked
// the person out, so this was a read-only field. Kept behind an explicit
// "Change" click because it IS a credential: the resident has to be told the
// new one before they next log in.
function UsernameControl({ memberId, username, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(username)
  // Track the saved value locally. onSaved() refetches the LIST, but this
  // panel keeps rendering the `member` object it was opened with, so without
  // this the field snapped back to the old username until the sheet was closed
  // and reopened (reported by Iain 2026-07-29).
  const [current, setCurrent] = useState(username)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState("")
  const [done, setDone]       = useState("")

  async function save() {
    const u = draft.trim()
    if (u === current) { setEditing(false); return }
    setSaving(true); setError(""); setDone("")
    const token = await getToken()
    const res = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ action: "set_username", member_id: memberId, username: u }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(data.error || "Could not rename"); return }
    setCurrent(u)
    setDraft(u)
    setDone(`Now logs in as ${u}`)
    setEditing(false)
    onSaved && onSaved()
  }

  return (
    <div>
      <label style={labelStyle}>Username (for login)</label>
      {editing ? (
        <>
          <input value={draft} onChange={e => setDraft(e.target.value)} style={inputStyle} autoFocus />
          <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", margin: "0.3rem 0 0.5rem" }}>
            Letters, numbers and underscores only, 3 or more. Their PIN does not change — but
            tell them the new username or they won&apos;t be able to log in.
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button onClick={() => { setEditing(false); setDraft(current); setError("") }}
              style={{ flex: 1, padding: "0.5rem", borderRadius: 8, border: "1px solid var(--border)",
                background: "var(--surface2)", color: "var(--text)", fontWeight: 600,
                fontSize: "0.82rem", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            <button onClick={save} disabled={saving}
              style={{ flex: 1, padding: "0.5rem", borderRadius: 8, border: "none", background: COLOUR,
                color: "#fff", fontWeight: 700, fontSize: "0.82rem",
                cursor: saving ? "wait" : "pointer", fontFamily: "inherit" }}>
              {saving ? "Saving…" : "Save username"}
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ ...readOnlyStyle, flex: 1 }}>{current}</div>
          <button onClick={() => { setEditing(true); setDone("") }}
            style={{ padding: "0.4rem 0.7rem", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--surface)", color: "var(--text)", fontWeight: 700,
              fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Change</button>
        </div>
      )}
      {error && <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: "0.3rem" }}>{error}</div>}
      {done && <div style={{ color: "var(--green)", fontSize: "0.78rem", marginTop: "0.3rem" }}>{done}</div>}
    </div>
  )
}

export default function ResidentEditForm({ member, linkedCategoryIds, linkedTitle, categories, residentsId, isSelf, onSaved, onClose }) {
  const [title, setTitle]     = useState(linkedTitle || "")
  // Contact details are dual-edit as of 2026-07-27 (Iain): the resident keeps
  // editing them in their own Profile, and an admin can now fill them in from
  // here. Practical driver -- plenty of residents will never set a phone or
  // house number themselves, and an admin had no way to complete the record.
  // Real name joined dual-edit 2026-07-29, and display_name joins it here
  // (2026-08-15) for the same reason: fire-warden/register accuracy needs an
  // admin able to correct a resident's own typo or an unhelpful Display
  // Name, not just view it. Username stays the one truly self-service-only
  // identity field (renaming it here would orphan the Auth user).
  const [name, setName]       = useState(member.name || "")
  const [displayName, setDisplayName] = useState(member.display_name || member.name || "")
  const [email, setEmail]     = useState(member.email || "")
  const [house, setHouse]     = useState(member.house_number || "")
  const [phone, setPhone]     = useState(member.phone || "")
  const [categoryIds, setCategoryIds] = useState(linkedCategoryIds)
  const [isAdminFlag, setIsAdminFlag] = useState(member.is_admin)
  const [hideName, setHideName]       = useState(member.hide_name)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState("")
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState("")

  const assignable = categories.filter(c => c.id !== residentsId)

  // Deactivate -- safe, reversible: blocks login, keeps every row of history
  // (bookings, coordinator credit, etc.) intact. This is the button to reach
  // for by default.
  async function deactivate() {
    if (!confirm(`Deactivate ${member.name}? They won't be able to log in, and they'll drop off this Contacts list. Nothing else about their account is touched.`)) return
    setRemoving(true); setRemoveError("")
    const token = await getToken()
    const res = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "set_member_status", member_id: member.id, status: "inactive" }),
    })
    const data = await res.json().catch(() => ({}))
    setRemoving(false)
    if (!res.ok) { setRemoveError(data.error || "Could not deactivate this account."); return }
    onSaved()
    onClose()
  }

  // Delete -- genuinely irreversible. The server refuses if this member has
  // any real history (bookings, coordinator assignments, votes, etc.) and
  // says so -- that's the expected outcome for almost every real resident;
  // this is really only for a duplicate/never-used account.
  async function deleteMember() {
    if (!confirm(`Permanently delete ${member.name}'s account? This cannot be undone. If they have any booking or activity history, this will be refused -- use Deactivate for that instead.`)) return
    setRemoving(true); setRemoveError("")
    const token = await getToken()
    const res = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "delete_member", member_id: member.id }),
    })
    const data = await res.json().catch(() => ({}))
    setRemoving(false)
    if (!res.ok) { setRemoveError(data.error || "Could not delete this account."); return }
    onSaved()
    onClose()
  }

  async function save() {
    // Same rule as Profile's own save (isValidDisplayName -- at least 3
    // letters): the server enforces this too, but failing fast here avoids
    // a round trip for the common typo/blank case.
    if (!isValidDisplayName(displayName.trim())) {
      setError("Display name must be at least 3 letters.")
      return
    }
    setSaving(true); setError("")
    const token = await getToken()
    const res = await fetch("/api/info/contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({
        member_id: member.id,
        name: name.trim() || member.name,
        display_name: displayName.trim(),
        title: title.trim() || null,
        email: email.trim() || null,
        house_number: house.trim() || null,
        phone: phone.trim() || null,
        category_ids: [residentsId, ...categoryIds.filter(id => id !== residentsId)],
        ...(isSelf ? {} : { is_admin: isAdminFlag }),
        hide_name: hideName,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || "Save failed"); return }
    onSaved()
    onClose()
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      <div>
        <label style={labelStyle}>Full name</label>
        <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "0.3rem" }}>
          The resident can also change this in their own profile — whichever was saved last wins.
        </div>
      </div>
      <div>
        <label style={labelStyle}>Display name</label>
        <input value={displayName} onChange={e => setDisplayName(e.target.value)} style={inputStyle} />
        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "0.3rem" }}>
          Shown around the app instead of the full name (Attendees, recipient lists, Contacts).
          The resident can also change this in their own profile — whichever was saved last wins.
        </div>
      </div>
      {member.username && (
        <UsernameControl memberId={member.id} username={member.username} onSaved={onSaved} />
      )}
      <div>
        <label style={labelStyle}>Email</label>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" style={inputStyle} />
      </div>
      {/* House # and Phone share a row -- two short fields have no business
          taking two full rows in a sheet this long (vertical space). */}
      <div style={{ display: "flex", gap: "0.6rem" }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>House #</label>
          <input value={house} onChange={e => setHouse(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Phone</label>
          <input value={phone} onChange={e => setPhone(formatPhoneInput(e.target.value))} type="tel" inputMode="numeric" maxLength={12} placeholder="0400 000 000" style={inputStyle} />
        </div>
      </div>
      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "-0.5rem" }}>
        The resident can also change these themselves in their profile — whichever was saved last wins.
      </div>
      <div>
        <label style={labelStyle}>Category</label>
        <div style={{ marginBottom: "0.4rem" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", background: "var(--surface2)",
            color: "var(--text-dim)", borderRadius: 20, padding: "0.25rem 0.75rem",
            fontSize: "0.8rem", fontWeight: 600,
          }}>Residents</span>
        </div>
        <CategoryPicker categories={assignable} selectedIds={categoryIds} onChange={setCategoryIds}
          onCategoryCreated={() => {}} allowCreate={false} />
      </div>
      <div>
        <label style={labelStyle}>Title / Role</label>
        <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.85rem", marginTop: "0.25rem" }}>
        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>
          Account (admin only)
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="button" disabled={isSelf} onClick={() => setIsAdminFlag(v => !v)} style={{
            padding: "0.35rem 0.75rem", borderRadius: 8, border: "1px solid",
            borderColor: isAdminFlag ? "var(--amber)" : "var(--border)",
            background: isAdminFlag ? "var(--amber)20" : "var(--surface)",
            color: isAdminFlag ? "var(--amber-dark)" : "var(--text-dim)",
            fontSize: "0.8rem", fontWeight: 700, fontFamily: "inherit",
            cursor: isSelf ? "default" : "pointer", opacity: isSelf ? 0.5 : 1,
          }}>{isAdminFlag ? "⚙️ Admin" : "Admin"}</button>
          <button type="button" onClick={() => setHideName(v => !v)} title="Hidden residents are not shown in attendee lists or the public Contacts list" style={{
            padding: "0.35rem 0.75rem", borderRadius: 8, border: "1px solid",
            borderColor: hideName ? "var(--purple)" : "var(--border)",
            background: hideName ? "var(--purple)20" : "var(--surface)",
            color: hideName ? "var(--purple)" : "var(--text-dim)",
            fontSize: "0.8rem", fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
          }}>{hideName ? "🔒 Private" : "Private"}</button>
        </div>
        <ResetPinControl memberId={member.id} username={member.username} />

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
          <button type="button" onClick={deactivate} disabled={removing || isSelf} style={{
            flex: 1, padding: "0.6rem", borderRadius: 10, border: "1px solid var(--border)",
            background: "var(--surface2)", color: "var(--text)", fontWeight: 600, fontSize: "0.85rem",
            cursor: (removing || isSelf) ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: isSelf ? 0.5 : 1,
          }}>Deactivate</button>
          <button type="button" onClick={deleteMember} disabled={removing || isSelf} style={{
            flex: 1, padding: "0.6rem", borderRadius: 10, border: "1px solid #fca5a5",
            background: "#fee2e2", color: "#991b1b", fontWeight: 600, fontSize: "0.85rem",
            cursor: (removing || isSelf) ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: isSelf ? 0.5 : 1,
          }}>Delete</button>
        </div>
        {isSelf && (
          <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "0.3rem" }}>
            You can't deactivate or delete your own account.
          </div>
        )}
        {removeError && <div style={{ color: "var(--danger)", fontSize: "0.8rem", marginTop: "0.4rem" }}>{removeError}</div>}
      </div>

      {error && <div style={{ color: "#b91c1c", fontSize: "0.83rem" }}>{error}</div>}

      <button onClick={save} disabled={saving} style={{
        background: COLOUR, color: "#fff", border: "none", borderRadius: 10,
        padding: "0.75rem", fontWeight: 700, fontSize: "0.95rem",
        cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1,
      }}>{saving ? "Saving…" : "Save Changes"}</button>
    </div>
  )
}
