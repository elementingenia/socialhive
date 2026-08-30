"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import ResidentEditForm, { Sheet, CategoryPicker, COLOUR, inputStyle, labelStyle, getToken, CreateLoginForm } from "@/components/ResidentEditPanel"
import { isBuiltInCategory } from "@/lib/contactCategories"
import { formatPhoneInput } from "@/lib/phone"
import { sydneyTodayStr } from "@/lib/date"
import { isExternalContact, displayRecipientName } from "@/lib/categoryQuestions"
import { resolveMemberName } from "@/lib/memberName"
import AskQuestion from "@/components/AskQuestion"

const secondaryButtonStyle = {
  padding: "0.5rem 0.9rem", borderRadius: 10, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text)", fontWeight: 700,
  fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit",
}

// Admin toolbar row (2026-07-12) -- three actions on one compact line rather
// than two full-size buttons plus a third wrapping onto its own row. Invite
// Code is visually distinct (solid fill, key icon) since it's a fundamentally
// different kind of action -- a secret residents need for registration, not
// a list-management action like the other two.
const toolbarButtonStyle = {
  flex: 1, padding: "0.5rem 0.4rem", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text)", fontWeight: 700,
  fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit",
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "center",
}
const inviteButtonStyle = {
  ...toolbarButtonStyle, border: "none", background: COLOUR, color: "#fff",
}
const exportButtonStyle = {
  padding: "0.5rem 0.7rem", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text)", fontWeight: 700,
  fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
}

// Admin-only export (2026-08-30, Iain: "publish option ... whatever they have
// the filtering set to"). Deliberately a client-side CSV download rather than
// a server-side push to Google Drive -- this app has never had server-side
// Drive credentials wired in (every Drive upload to date has gone through
// Claude's own Drive connector outside the app), and building that out is a
// genuinely bigger, separate piece of infrastructure than a button. A CSV
// download opens straight into Excel/Numbers/Sheets and needs nothing new.
// Exports exactly the `filtered` array already on screen -- same category +
// search state the admin is looking at, not a fresh unfiltered pull -- so it
// can never show the admin one list and export a different one.
function csvEscape(val) {
  const s = val == null ? "" : String(val)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function exportContactsCsv(entries, scopeLabel) {
  const header = ["House #", "Name", "Phone", "Email"]
  const withHouse = entries.map(e => ({
    house: e.isResident ? (e.house_number || "") : "",
    name: e.realName ? `${e.name} (${e.realName})` : e.name,
    phone: e.phone || "",
    email: e.email || "",
  }))
  // Sorted by house number by default (Iain, 2026-08-30) -- numeric, not
  // alphabetic (house_number is stored as text, e.g. "007", so a plain
  // string sort would put "10" before "9"). Anything without a house
  // number (non-resident contacts, or a resident with none on file) has
  // no meaningful position in a house-number order, so those sort last,
  // alphabetically by name among themselves rather than being scattered.
  const sorted = [...withHouse].sort((a, b) => {
    const an = parseInt(a.house, 10)
    const bn = parseInt(b.house, 10)
    const aValid = !isNaN(an)
    const bValid = !isNaN(bn)
    if (aValid && bValid) return an - bn || a.name.localeCompare(b.name)
    if (aValid) return -1
    if (bValid) return 1
    return a.name.localeCompare(b.name)
  })
  const rows = sorted.map(r => [r.house, r.name, r.phone, r.email])
  const csv = [header, ...rows].map(r => r.map(csvEscape).join(",")).join("\r\n")
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  const dateStr = sydneyTodayStr()
  a.href = url
  a.download = `Contacts_${scopeLabel}_${dateStr}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ── Contact card ─────────────────────────────────────────────────────────────
// Compact by design (Iain, 2026-07-12) -- this list is headed toward 200+
// entries as the community scales, so each tile is a single scan-able line
// (name + house #) by default. A "More" toggle appears for EVERYONE
// whenever a contact actually has title/phone/email beyond what's already
// on the compact line -- admins additionally get "Edit" alongside it, since
// viewing details and editing them are different actions (2026-07-12,
// clarified same day: Edit alone isn't a substitute for a quick "More").
function ContactCard({ contact, badge, external = false, isResident = true, onEdit }) {
  const hasMore = !!(contact.title || contact.phone || contact.email)
  // External contacts open with their details already showing. They can't be
  // messaged in the app, so the useful thing is their phone/email -- burying
  // it behind "More" would make a dimmed card a dead end (scope §7).
  const [expanded, setExpanded] = useState(external && hasMore)
  const isAdminView = !!onEdit

  return (
    <div style={{
      background: external ? "rgba(138,143,107,0.10)" : "var(--surface)", borderRadius: 10,
      border: "1px solid var(--border)",
      borderLeft: external ? "3px solid rgba(138,143,107,0.55)" : "1px solid var(--border)",
      padding: "0.55rem 0.8rem",
      marginBottom: "0.4rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
        <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: "0.4rem", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text)" }}>{contact.name}</span>
          {isResident && contact.house_number && (
            <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>· #{contact.house_number}</span>
          )}
          {badge && (
            <span style={{
              fontSize: "0.6rem", fontWeight: 700, padding: "0.05rem 0.4rem",
              borderRadius: 10, background: "var(--surface2)", color: "var(--text-dim)",
            }}>{badge}</span>
          )}
          {/* Colour is never the only signal -- this label carries the meaning
              for colour-vision-deficient and screen-reader users. The contact
              NAME stays full-strength var(--text); only the container is
              tinted, because dimming text on an aging-eyes app would be a
              legibility regression. */}
          {external && (
            <span style={{
              fontSize: "0.6rem", fontWeight: 700, padding: "0.05rem 0.4rem",
              borderRadius: 10, background: "rgba(138,143,107,0.18)", color: "var(--external-ink)",
            }}>External</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
          {hasMore && (
            <button onClick={() => setExpanded(v => !v)} style={{
              flexShrink: 0, fontSize: "0.7rem", fontWeight: 700, color: COLOUR,
              background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0,
            }}>{expanded ? "Less ▲" : "More ▼"}</button>
          )}
          {isAdminView && (
            <button onClick={onEdit} style={{
              flexShrink: 0, fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.55rem", borderRadius: 6,
              border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
              cursor: "pointer", fontFamily: "inherit",
            }}>Edit</button>
          )}
        </div>
      </div>
      {contact.realName && (
        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "0.15rem" }}>
          {contact.realName}
        </div>
      )}
      {expanded && (
        <div style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          {contact.title && (
            <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>{contact.title}</div>
          )}
          {contact.phone && (
            <a href={`tel:${contact.phone}`} style={{ fontSize: "0.85rem", color: COLOUR, textDecoration: "none", fontWeight: 600 }}>
              📞 {contact.phone}
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} style={{ fontSize: "0.85rem", color: COLOUR, textDecoration: "none", fontWeight: 600 }}>
              ✉ {contact.email}
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ── Add / Edit a standalone (non-resident) contact ────────────────────────────
const EMPTY = { name: "", title: "", phone: "", email: "", house_number: "", category_ids: [] }

function ContactForm({ contact, categories, setCategories, members, onSaved, onClose }) {
  const isEdit = !!contact
  const [form, setForm] = useState(() => contact ? {
    name: contact.name, title: contact.title || "", phone: contact.phone || "",
    email: contact.email || "", house_number: contact.house_number || "",
    category_ids: (contact.contact_category_members || []).map(m => m.category_id),
  } : EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState("")

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const nameMatchesMember = form.name.trim() && !isEdit &&
    members.some(m => m.name.toLowerCase() === form.name.trim().toLowerCase())

  async function save() {
    setError("")
    if (!form.name.trim()) { setError("Name is required"); return }
    if (!form.category_ids.length) { setError("At least one category is required"); return }
    setSaving(true)
    const token = await getToken()
    const payload = {
      name: form.name.trim(),
      title: form.title.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      house_number: form.house_number.trim() || null,
      category_ids: form.category_ids,
    }
    const res = await fetch("/api/info/contacts", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(isEdit ? { id: contact.id, ...payload } : payload),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || "Save failed"); return }
    onSaved()
    onClose()
  }

  async function toggleActive() {
    const token = await getToken()
    await fetch("/api/info/contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ id: contact.id, active: !contact.active }),
    })
    onSaved()
    onClose()
  }

  async function del() {
    if (!confirm(`Delete "${contact.name}"?`)) return
    const token = await getToken()
    await fetch("/api/info/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ id: contact.id }),
    })
    onSaved()
    onClose()
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div>
        <label style={labelStyle}>Name <span style={{ color: "var(--danger)" }}>*</span></label>
        <input value={form.name} onChange={e => set("name", e.target.value)}
          style={{ ...inputStyle, border: `1.5px solid ${form.name.trim() ? "var(--green)" : "var(--danger)"}` }} />
        {nameMatchesMember && (
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.3rem" }}>
            This matches an existing resident's name — residents already appear automatically, no need to add them here.
          </div>
        )}
      </div>
      <div>
        <label style={labelStyle}>Category <span style={{ color: "var(--danger)" }}>*</span></label>
        <CategoryPicker categories={categories} selectedIds={form.category_ids}
          onChange={ids => set("category_ids", ids)}
          onCategoryCreated={cat => setCategories(prev => [...prev, cat])}
          required />
      </div>
      <div>
        <label style={labelStyle}>Title / Role</label>
        <input value={form.title} onChange={e => set("title", e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Phone</label>
        <input value={form.phone} onChange={e => set("phone", formatPhoneInput(e.target.value))} type="tel" inputMode="numeric" maxLength={12} placeholder="0400 000 000" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Email</label>
        <input value={form.email} onChange={e => set("email", e.target.value)} type="email" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>House #</label>
        <input value={form.house_number} onChange={e => set("house_number", e.target.value)} style={inputStyle} />
      </div>

      {error && <div style={{ color: "#b91c1c", fontSize: "0.83rem" }}>{error}</div>}

      <button onClick={save} disabled={saving} style={{
        background: COLOUR, color: "#fff", border: "none", borderRadius: 10,
        padding: "0.75rem", fontWeight: 700, fontSize: "0.95rem",
        cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1,
      }}>{saving ? "Saving…" : (isEdit ? "Save Changes" : "Add Contact")}</button>

      {isEdit && (
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={toggleActive} style={{
            flex: 1, padding: "0.6rem", borderRadius: 10, border: "1px solid var(--border)",
            background: "var(--surface2)", color: "var(--text)", fontWeight: 600, fontSize: "0.85rem",
            cursor: "pointer", fontFamily: "inherit",
          }}>{contact.active ? "Hide (mark inactive)" : "Reactivate"}</button>
          <button onClick={del} style={{
            flex: 1, padding: "0.6rem", borderRadius: 10, border: "1px solid #fca5a5",
            background: "#fee2e2", color: "#991b1b", fontWeight: 600, fontSize: "0.85rem",
            cursor: "pointer", fontFamily: "inherit",
          }}>Delete</button>
        </div>
      )}
      {isEdit && !contact.member_id && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.85rem", marginTop: "0.25rem" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>Give this person a login</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "0.6rem" }}>Creates an app account so they can sign in — and be picked as a resident when someone books multiple seats.</div>
          <CreateLoginForm defaultName={contact.name} contactId={contact.id} onCreated={() => { onSaved(); onClose() }} />
        </div>
      )}
    </div>
  )
}

// ── Category management ───────────────────────────────────────────────────────
function CategoryManager({ categories, setCategories, onSaved, loginMembersByCategory = {} }) {
  const [catForm, setCatForm]     = useState("")
  const [catSaving, setCatSaving] = useState(false)
  const [catError, setCatError]   = useState("")

  async function addCategory() {
    if (!catForm.trim()) return
    setCatSaving(true); setCatError("")
    const token = await getToken()
    const res = await fetch("/api/info/contact-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ name: catForm.trim() }),
    })
    const data = await res.json()
    setCatSaving(false)
    if (!res.ok) { setCatError(data.error || "Add failed"); return }
    setCatForm("")
    setCategories(prev => [...prev, data])
    onSaved()
  }

  async function toggleAskable(cat) {
    setCatError("")
    const next = !cat.askable
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, askable: next } : c))
    const token = await getToken()
    const res = await fetch("/api/info/contact-categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ id: cat.id, askable: next }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setCatError(data.error || "Could not update")
      setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, askable: cat.askable } : c))
    }
  }

  async function deleteCategory(cat) {
    setCatError("")
    if (!confirm(`Delete category "${cat.name}"?`)) return
    const token = await getToken()
    const res = await fetch("/api/info/contact-categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ id: cat.id }),
    })
    const data = await res.json()
    if (!res.ok) { setCatError(data.error || "Delete failed"); return }
    setCategories(prev => prev.filter(c => c.id !== cat.id))
    onSaved()
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <input value={catForm} onChange={e => setCatForm(e.target.value)}
          placeholder="New category name" style={{ ...inputStyle, flex: 1 }} />
        <button onClick={addCategory} disabled={catSaving || !catForm.trim()} style={{
          background: COLOUR, color: "#fff", border: "none", borderRadius: 10,
          padding: "0 1rem", fontWeight: 700, cursor: "pointer", fontSize: "0.88rem", fontFamily: "inherit",
        }}>Add</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {categories.map(c => (
          <div key={c.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem",
            padding: "0.5rem 0.7rem", background: "var(--surface2)", borderRadius: 8,
          }}>
            <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
            {/* Askable + Delete share this row rather than stacking -- vertical
                space is a core mantra and this list grows with the community. */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0 }}>
              {/* Why a category isn't offered must be VISIBLE. Askable is only
                  half the rule -- it also needs someone with an app login --
                  and without this an admin adds a contact to Committee, sees
                  "Askable", and has no idea why it never appears on Home
                  (exactly what happened with Stuart, 2026-07-27). */}
              {!isBuiltInCategory(c.name) && c.askable && !loginMembersByCategory[c.id]?.size && (
                <span style={{
                  fontSize: "0.68rem", fontWeight: 600, color: "var(--external-ink)",
                  background: "rgba(138,143,107,0.18)", borderRadius: 10,
                  padding: "0.1rem 0.5rem", whiteSpace: "nowrap",
                }}>No app login yet</span>
              )}
              {!isBuiltInCategory(c.name) && (
                <button onClick={() => toggleAskable(c)} style={{
                  background: c.askable ? COLOUR : "var(--surface)", color: c.askable ? "#fff" : "var(--text-dim)",
                  border: `1px solid ${c.askable ? COLOUR : "var(--border)"}`, borderRadius: 20,
                  padding: "0.15rem 0.6rem", fontSize: "0.7rem", fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                }}>{c.askable ? "Askable" : "Not askable"}</button>
              )}
              {!isBuiltInCategory(c.name) && (
                <button onClick={() => deleteCategory(c)} style={{
                  background: "none", border: "none", color: "#991b1b", cursor: "pointer",
                  fontSize: "0.78rem", fontWeight: 600, fontFamily: "inherit",
                }}>Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.6rem", lineHeight: 1.45 }}>
        <strong>Askable</strong> lets residents send a question to this group from Home. A group only
        appears as an option if it <em>also</em> contains at least one person with an app login — a
        contact with no login can&apos;t receive or answer a question, so a group of only those is
        marked <em>No app login yet</em> and stays hidden. Give someone a login from their contact
        card (Edit → &quot;Give this person a login&quot;). Residents is never askable — a question to
        everyone is a notice, not a question.
      </div>
      {catError && <div style={{ color: "#b91c1c", fontSize: "0.8rem", marginTop: "0.5rem" }}>{catError}</div>}
    </div>
  )
}

// ── Invite Code control ───────────────────────────────────────────────────────
// Moved here from Admin > Members (2026-07-12) as part of folding that section
// into Contacts -- new residents need this code to register. Stored in the
// settings table (key 'invite_token'); RLS restricts writes to admins.
function InviteCodeControl({ code, onSaved }) {
  const controlLabelStyle = { fontSize:'0.78rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4, display:'block' }
  const [revealed, setRevealed] = useState(false)
  const [editing,  setEditing]  = useState(false)
  const [draft,    setDraft]    = useState(code)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => { setDraft(code) }, [code])

  async function save() {
    const trimmed = draft.trim()
    if (!trimmed) { setError('Invite code cannot be empty'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('settings')
      .update({ value: trimmed, updated_at: new Date().toISOString() })
      .eq('key', 'invite_token')
    setSaving(false)
    if (err) { setError('Could not save — try again'); return }
    onSaved(trimmed)
    setEditing(false)
    setRevealed(true)
  }

  return (
    <div>
      <div style={{ fontSize:'0.85rem', color:'var(--text-dim)', lineHeight:1.5, marginBottom:'1rem' }}>
        New residents enter this code to register. Change it any time — existing members are unaffected.
      </div>

      {editing ? (
        <div>
          <label style={controlLabelStyle}>New Invite Code</label>
          <input style={inputStyle} value={draft} onChange={e => setDraft(e.target.value)} autoFocus />
          {error && <div style={{ color:'var(--danger)', fontSize:'0.8rem', marginTop:'0.4rem' }}>{error}</div>}
          <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.85rem' }}>
            <button onClick={() => { setEditing(false); setDraft(code); setError('') }}
              style={{ flex:1, padding:'0.7rem', borderRadius:'10px', border:'1px solid var(--border)', background:'var(--surface2)', cursor:'pointer', fontSize:'0.85rem', fontWeight:600 }}>
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              style={{ flex:1, padding:'0.7rem', borderRadius:'10px', border:'none', background:COLOUR, color:'#fff', cursor: saving ? 'wait' : 'pointer', fontSize:'0.85rem', fontWeight:700 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'0.6rem',
            background:'var(--surface2)', borderRadius:'10px', border:'1px solid var(--border)', padding:'0.85rem 1rem', marginBottom:'0.85rem' }}>
            <span style={{ fontFamily:'monospace', fontSize:'1.1rem', fontWeight:700, letterSpacing: revealed ? '0.03em' : '0.2em' }}>
              {revealed ? code : '•'.repeat(Math.max(code.length, 6))}
            </span>
            <button onClick={() => setRevealed(r => !r)}
              style={{ background:'none', border:'none', cursor:'pointer', fontSize:'0.78rem', fontWeight:700, color:COLOUR, whiteSpace:'nowrap' }}>
              {revealed ? 'Hide' : 'Show'}
            </button>
          </div>
          <button onClick={() => { setEditing(true); setDraft(code) }}
            style={{ width:'100%', padding:'0.7rem', borderRadius:'10px', border:`1px solid ${COLOUR}`, background:'none', color:COLOUR, cursor:'pointer', fontSize:'0.85rem', fontWeight:700 }}>
            Change Code
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ContactsPage() {
  const { isAdmin, member: me }     = useUser()
  const [categories, setCategories] = useState([])
  const [members, setMembers]       = useState([])
  const [contacts, setContacts]     = useState([])
  const [activeFilter, setFilter]   = useState(null)
  const [loading, setLoading]       = useState(true)
  const [sheet, setSheet]           = useState(null) // null | "add" | "categories" | "invite" | {type,member|contact}
  const [search, setSearch]         = useState("")
  const [inviteCode, setInviteCode] = useState("")

  const load = useCallback(async () => {
    const [catRes, memberRes, contactRes, inviteRes] = await Promise.all([
      supabase.from("contact_categories").select("id, name, display_order, askable").eq("active", true).order("display_order"),
      supabase.from("members").select("id, name, display_name, username, email, house_number, phone, hide_name, is_admin").eq("status", "active"),
      supabase.from("contacts")
        .select("id, name, title, phone, email, house_number, member_id, active, contact_category_members(category_id)")
        .order("display_order"),
      supabase.from("settings").select("value").eq("key", "invite_token").single(),
    ])
    setCategories(catRes.data || [])
    setMembers(memberRes.data || [])
    setContacts(contactRes.data || [])
    setInviteCode(inviteRes.data?.value || "")
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const residentsId = categories.find(c => c.name.toLowerCase() === "residents")?.id

  useEffect(() => {
    if (activeFilter === null && residentsId) setFilter(residentsId)
  }, [residentsId, activeFilter])

  const displayContacts = useMemo(() => contacts.filter(c => !c.member_id && (c.active || isAdmin)), [contacts, isAdmin])

  // Who in each category could actually receive a question -- i.e. has an app
  // login and an active member record. Mirrors lib/categoryQuestions.js's
  // loginMemberIds, computed from data this page already has (no extra
  // request). Member IDs rather than a count, because the Ask button below
  // has to exclude the viewer themselves.
  const loginMembersByCategory = useMemo(() => {
    const activeMemberIds = new Set(members.map(m => m.id))
    const map = {}
    for (const c of contacts) {
      if (!c.active || !c.member_id || !activeMemberIds.has(c.member_id)) continue
      for (const link of c.contact_category_members || []) {
        (map[link.category_id] ||= new Set()).add(c.member_id)
      }
    }
    return map
  }, [contacts, members])
  const contactByMemberId = useMemo(() => {
    const map = {}
    for (const c of contacts) if (c.member_id) map[c.member_id] = c
    return map
  }, [contacts])

  // Every active resident appears in the list for everyone — Private (hide_name)
  // residents are never excluded, but non-admins see "Resident" with no
  // contact details instead of their real name/email/house#/phone/title.
  // Admins always see the real name and details regardless of Private, and
  // every viewer always sees their OWN name regardless of their own Private
  // flag -- Private only hides you from other (non-admin) residents, not
  // from yourself (Iain, 2026-07-12).
  const entries = useMemo(() => {
    const memberEntries = members.map(m => {
      const linked = contactByMemberId[m.id]
      const isSelf = m.id === me?.id
      const maskedForViewer = m.hide_name && !isAdmin && !isSelf
      // display_name (2026-08-14): preferred fallback ahead of the real name
      // once unmasked -- masking itself (maskedForViewer) is unchanged.
      // searchName carries BOTH raw name and display_name, unmasked, so a
      // viewer who only knows one of the two names can still find the card
      // -- but only when this entry isn't masked for them (never leak the
      // real name of a Private resident into search for a non-admin).
      //
      // realName (2026-08-15, Iain): Display Name is front-and-centre for
      // everyone, but an admin specifically needs the Real Name reachable
      // without a click -- fire-warden/register accuracy means an admin
      // scanning this list has to be able to tell "Coastal Jane" is really
      // "Jane Doe" at a glance, not just search for either. Admin-only
      // (canManage), and only shown when it actually differs from what's
      // already on the card -- Private residents already collapse to
      // "Resident" for non-admins with nothing further revealed, unchanged.
      return {
        key: `m-${m.id}`,
        name: maskedForViewer ? "Resident" : resolveMemberName(m, { viewerId: me?.id, canManage: isAdmin }),
        realName: (!maskedForViewer && isAdmin && m.display_name && m.display_name !== m.name) ? m.name : null,
        searchName: maskedForViewer ? null : [m.name, m.display_name].filter(Boolean).join(" "),
        email: maskedForViewer ? null : m.email,
        house_number: maskedForViewer ? null : m.house_number,
        phone: maskedForViewer ? null : (m.phone || null),
        title: maskedForViewer ? null : (linked?.title || null),
        categoryIds: [residentsId, ...((linked?.contact_category_members) || []).map(x => x.category_id)].filter(Boolean),
        isMember: true, member: m,
        // Every active member is implicitly a Resident (migration 029), so a
        // member is never external.
        external: false,
        isResident: true,   // members are implicitly Residents (migration 029)
      badge: isAdmin && m.hide_name ? "Private" : null,
      }
    })
    const contactEntries = displayContacts.map(c => ({
      key: `c-${c.id}`, name: c.name, email: c.email, house_number: c.house_number,
      phone: c.phone, title: c.title,
      categoryIds: (c.contact_category_members || []).map(x => x.category_id),
      isMember: false, contact: c,
      // External = not in the Residents category (Iain's rule, 2026-07-27).
      // NOTE this is deliberately a DIFFERENT test from the one that decides
      // whether a category can be asked a question (that one requires an app
      // login -- see lib/questionRouting.js). A resident with no account, like
      // Lyn or Diane, is still a neighbour and is NOT marked external; they
      // just can't be messaged in-app.
      external: isExternalContact((c.contact_category_members || []).map(x => x.category_id), residentsId),
      // House number is a resident's detail. A tradesperson or the Community
      // Manager has one on file sometimes, but showing it implies they live
      // here (Iain, 2026-07-29), so it is hidden unless they're a Resident.
      isResident: !!residentsId && (c.contact_category_members || []).some(x => x.category_id === residentsId),
      badge: isAdmin && !c.active ? "Hidden" : null,
    }))
    return [...memberEntries, ...contactEntries].sort((a, b) => a.name.localeCompare(b.name))
  }, [members, displayContacts, contactByMemberId, residentsId, isAdmin])

  // Mirrors the server-side gate in lib/questionRouting.js's askableCategories:
  // active + askable + at least one member with a login. The extra clause here
  // is excluding the viewer, which only matters on this screen (Home's picker
  // gets an already-filtered list from the API).
  const askableActiveCategory = useMemo(() => {
    if (!activeFilter || activeFilter === "all") return null
    const cat = categories.find(c => c.id === activeFilter)
    if (!cat || !cat.askable || isBuiltInCategory(cat.name)) return null
    const others = [...(loginMembersByCategory[cat.id] || [])].filter(id => id !== me?.id)
    if (!others.length) return null
    // Masked exactly like the contacts list itself -- a Private resident reads
    // as "Resident" to a non-admin. Same helper the targets endpoint uses.
    const byId = Object.fromEntries(members.map(m => [m.id, m]))
    const names = others
      .map(id => displayRecipientName(byId[id], { id: me?.id, is_admin: isAdmin }))
      .filter(Boolean)
    return { ...cat, recipientNames: names }
  }, [activeFilter, categories, loginMembersByCategory, me, members, isAdmin])

  const categoryFiltered = activeFilter === "all"
    ? entries
    : entries.filter(e => e.categoryIds.includes(activeFilter))

  // Label for the export filename -- mirrors whichever category chip is
  // active, "All" otherwise. Sanitised to filesystem-safe characters only.
  const exportScopeLabel = useMemo(() => {
    const raw = (!activeFilter || activeFilter === "all")
      ? "All"
      : (categories.find(c => c.id === activeFilter)?.name || "Filtered")
    return raw.replace(/[^a-z0-9]+/gi, "_")
  }, [activeFilter, categories])
  // Searches name, title/role, phone, email and house number -- not just name
  // (Iain, 2026-07-29). Phone matching ignores spaces and punctuation so
  // "0412" finds "+61 412 ...", and house only counts for a Resident, matching
  // what the card actually displays.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return categoryFiltered
    const digits = q.replace(/\D/g, "")
    return categoryFiltered.filter(e => {
      const haystack = [e.name, e.searchName, e.title, e.email, e.isResident ? e.house_number : null]
        .filter(Boolean).join(" ").toLowerCase()
      if (haystack.includes(q)) return true
      if (digits && e.phone && e.phone.replace(/\D/g, "").includes(digits)) return true
      return false
    })
  }, [categoryFiltered, search])

  const initializing = loading || activeFilter === null

  if (initializing) return (
    <div style={{ padding: "1.25rem 1rem" }}>
      {[1,2,3].map(i => <div key={i} style={{ height: 72, borderRadius: 12, background: "var(--surface2)", marginBottom: "0.6rem" }} />)}
    </div>
  )

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      {categories.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          {[...categories, { id: "all", name: "All" }].map(c => (
            <button key={c.id} onClick={() => setFilter(c.id)} style={{
              padding: "0.35rem 0.9rem", borderRadius: 20, border: "none",
              fontFamily: "inherit", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
              background: activeFilter === c.id ? COLOUR : "var(--surface2)",
              color: activeFilter === c.id ? "#fff" : "var(--text-dim)",
            }}>{c.name}</button>
          ))}
        </div>
      )}

      {/* Ask this group, from the moment of intent -- you're already looking at
          the Committee because you want something from them, so don't make the
          resident go back to Home and re-pick the category they're staring at.
          Fixed-context AskQuestion (no picker needed, no extra endpoint).
          Rendered ONLY when it applies: nothing at all for Residents, "All",
          a non-askable category, or one where the only login-holder is the
          viewer themselves (you can't ask yourself -- the targets endpoint
          excludes the viewer for the same reason, and a button that opened
          onto nobody would be a dead end). No wrapper when absent. */}
      {askableActiveCategory && (
        <div style={{ marginBottom: "0.75rem" }}>
          <AskQuestion
            contextType="category"
            contextKey={askableActiveCategory.id}
            contextLabel={askableActiveCategory.name}
            colour={COLOUR}
            recipientNames={askableActiveCategory.recipientNames}
            trigger={(open) => (
              <button onClick={open} style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                gap: "0.4rem", padding: "0.55rem", borderRadius: 10,
                border: `1.5px solid ${COLOUR}`, background: "var(--surface)", color: COLOUR,
                fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit",
              }}>
                <span aria-hidden>💬</span> Ask the {askableActiveCategory.name}
              </button>
            )}
          />
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
          style={{ ...inputStyle, flex: 1 }} />
        <span style={{ fontSize: "0.78rem", color: "var(--text-dim)", whiteSpace: "nowrap" }}>{filtered.length}</span>
        {isAdmin && (
          <button
            onClick={() => exportContactsCsv(filtered, exportScopeLabel)}
            title="Download the list currently shown (House #, Name, Phone, Email) as a CSV"
            style={exportButtonStyle}>
            ⬇ Export
          </button>
        )}
      </div>

      {isAdmin && (
        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1rem" }}>
          <button onClick={() => setSheet("add")} style={toolbarButtonStyle}>+ Add</button>
          <button onClick={() => setSheet("addResident")} style={toolbarButtonStyle}>👤 Add Resident</button>
          <button onClick={() => setSheet("categories")} style={toolbarButtonStyle}>Categories</button>
          <button onClick={() => setSheet("invite")} style={inviteButtonStyle}>🔑 Invite Code</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--text-dim)", fontSize: "0.9rem" }}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>👥</div>
          No contacts in this category
        </div>
      ) : (
        filtered.map(e => (
          <ContactCard key={e.key} contact={e} badge={e.badge} external={e.external} isResident={e.isResident}
            onEdit={isAdmin ? () => setSheet(e.isMember ? { type: "resident", member: e.member } : { type: "contact", contact: e.contact }) : null} />
        ))
      )}

      <Sheet open={sheet === "add"} onClose={() => setSheet(null)} title="Add Contact">
        <ContactForm categories={categories} setCategories={setCategories} members={members} onSaved={load} onClose={() => setSheet(null)} />
      </Sheet>

      <Sheet open={sheet === "addResident"} onClose={() => setSheet(null)} title="Add Resident Login">
        <div style={{ fontSize: "0.83rem", color: "var(--text-dim)", marginBottom: "0.75rem" }}>
          Creates an app account for a resident who hasn\'t registered themselves. They\'ll appear in the Residents list and can be added to bookings.
        </div>
        <CreateLoginForm onCreated={() => { load(); setSheet(null) }} />
      </Sheet>

      <Sheet open={sheet === "categories"} onClose={() => setSheet(null)} title="Manage Categories">
        <CategoryManager categories={categories} setCategories={setCategories} onSaved={load} loginMembersByCategory={loginMembersByCategory} />
      </Sheet>

      <Sheet open={sheet === "invite"} onClose={() => setSheet(null)} title="Invite Code">
        <InviteCodeControl code={inviteCode} onSaved={code => setInviteCode(code)} />
      </Sheet>

      <Sheet open={sheet?.type === "contact"} onClose={() => setSheet(null)} title="Edit Contact">
        {sheet?.type === "contact" && (
          <ContactForm contact={sheet.contact} categories={categories} setCategories={setCategories} members={members} onSaved={load} onClose={() => setSheet(null)} />
        )}
      </Sheet>

      <Sheet open={sheet?.type === "resident"} onClose={() => setSheet(null)} title="Edit Resident">
        {sheet?.type === "resident" && (
          <ResidentEditForm
            member={sheet.member}
            linkedCategoryIds={(contactByMemberId[sheet.member.id]?.contact_category_members || []).map(x => x.category_id)}
            linkedTitle={contactByMemberId[sheet.member.id]?.title}
            categories={categories}
            residentsId={residentsId}
            isSelf={sheet.member.id === me?.id}
            onSaved={load}
            onClose={() => setSheet(null)}
          />
        )}
      </Sheet>
    </div>
  )
}
