"use client"
import { useState, useEffect, useCallback } from "react"
import { authedFetch } from "@/lib/getAuthToken"
import RichEditor from "@/components/RichEditor"
import { isHtmlContent } from "@/lib/richText"

// Event notices (Iain, 2026-10-06) -- a coordinator's message to the people
// attending ONE event. Same look and behaviour as hub/club notices
// (components/HubNotices.js), but the audience is the event's attendees
// (confirmed + waitlisted, plus residents named in a party) and only they,
// and the event's managers, can read them. Who can post/edit/remove is
// decided server-side (app/api/event-notices: admin, area Owner, or this
// event's coordinator), so every hub's card gets the same rule.
//
// Vertical space: renders nothing at all unless the viewer can post or there
// is a notice for them to read.

// ── Batching ────────────────────────────────────────────────────────────────
// A list page renders many cards; each card's component asks for its own
// event, and requests made in the same tick go out as ONE GET.
let queue = new Map()  // eventId -> [resolve, ...]
let timer = null
const EMPTY = { notices: [], canPost: false }
const CHUNK = 60

function requestNotices(eventId) {
  return new Promise(resolve => {
    if (!queue.has(eventId)) queue.set(eventId, [])
    queue.get(eventId).push(resolve)
    if (!timer) timer = setTimeout(flush, 25)
  })
}

async function flush() {
  const batch = queue
  queue = new Map()
  timer = null
  const ids = [...batch.keys()]
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    let byEvent = {}
    try {
      const res = await authedFetch(`/api/event-notices?event_ids=${chunk.map(encodeURIComponent).join(",")}`, { cache: "no-store" })
      if (res.ok) byEvent = (await res.json()).byEvent || {}
    } catch (_) { /* fall through to empty */ }
    for (const id of chunk) for (const resolve of batch.get(id)) resolve(byEvent[id] || EMPTY)
  }
}

// ── Component ───────────────────────────────────────────────────────────────
export default function EventNotices({ eventId, colour = "var(--teal)", style }) {
  const [notices, setNotices]     = useState([])
  const [canPost, setCanPost]     = useState(false)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft]         = useState("")
  const [posting, setPosting]     = useState(false)
  const [confirmId, setConfirmId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState("")
  const [saving, setSaving]       = useState(false)
  const [toast, setToast]         = useState(null)

  const load = useCallback(() => {
    if (!eventId) return
    let live = true
    requestNotices(eventId).then(d => {
      if (!live) return
      setNotices(d.notices || [])
      setCanPost(!!d.canPost)
    })
    return () => { live = false }
  }, [eventId])
  useEffect(() => load(), [load])

  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 4000) }

  async function send(method, body) {
    const res = await authedFetch("/api/event-notices", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, data }
  }

  async function postNotice() {
    if (!draft.trim() || posting) return
    setPosting(true)
    try {
      const { ok, data } = await send("POST", { event_id: eventId, content: draft })
      if (!ok) { flash(data.error || "Could not send notice"); return }
      setDraft(""); setComposing(false); load()
      const n = data.notified || 0
      let msg = n ? `Sent to ${n} attendee${n !== 1 ? "s" : ""}` : "Posted — no attendees to notify yet"
      if (data.noApp) msg += ` · ${data.noApp} without the app won't get it`
      flash(msg)
    } finally {
      setPosting(false)
    }
  }

  async function removeNotice(id) {
    setConfirmId(null)
    const { ok, data } = await send("DELETE", { id })
    if (!ok) flash(data.error || "Could not remove notice")
    else flash("Notice removed")
    load()
  }

  async function saveEdit() {
    if (!editDraft.trim() || saving) return
    setSaving(true)
    try {
      const { ok, data } = await send("PATCH", { id: editingId, content: editDraft })
      if (!ok) { flash(data.error || "Could not save changes"); return }
      setEditingId(null); setEditDraft(""); load(); flash("Notice updated")
    } finally {
      setSaving(false)
    }
  }

  if (!canPost && notices.length === 0) return null

  const fmt = (iso) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" })
  const linkBtn = { background: "none", border: "none", fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit", padding: "4px 0" }
  const actionBtn = (primary, disabled) => ({
    flex: primary ? 2 : 1, padding: "0.6rem", borderRadius: 10, fontFamily: "inherit",
    border: primary ? "none" : "1px solid var(--border)",
    background: primary ? colour : "var(--surface2)",
    color: primary ? "#fff" : "var(--text)", fontWeight: primary ? 700 : 600,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
  })

  return (
    <div onClick={e => e.stopPropagation()} style={{ marginBottom: "0.5rem", ...style }}>
      {toast && <div role="status" style={{ position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "var(--text)", color: "var(--bg)", padding: "0.5rem 1rem", borderRadius: 8, fontSize: "0.85rem", fontWeight: 600, maxWidth: "90vw", textAlign: "center" }}>{toast}</div>}

      {notices.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: canPost ? 6 : 0 }}>
          {notices.map(n => (
            <div key={n.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${colour}`, borderRadius: 10, padding: "0.6rem 0.8rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: colour, textTransform: "uppercase", letterSpacing: "0.04em" }}>📣 Notice to attendees</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>{fmt(n.created_at)}</span>
              </div>
              {editingId === n.id ? (
                <div style={{ marginTop: 6 }}>
                  <RichEditor key={`event-notice-edit-${n.id}`} initialValue={n.content} hubColour={colour}
                    bg="card" onChange={setEditDraft} placeholder="Notice text…" />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={() => { setEditingId(null); setEditDraft("") }} style={actionBtn(false)}>Cancel</button>
                    <button onClick={saveEdit} disabled={saving || !editDraft.trim()} style={actionBtn(true, saving || !editDraft.trim())}>{saving ? "Saving…" : "Save changes"}</button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: "0.88rem", color: "var(--text)", lineHeight: 1.5, marginTop: 4, overflowWrap: "anywhere" }}>
                  {isHtmlContent(n.content)
                    ? <span dangerouslySetInnerHTML={{ __html: n.content }} />
                    : n.content}
                </div>
              )}
              {canPost && editingId !== n.id && (confirmId === n.id ? (
                <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Remove this notice from the event?</span>
                  <button onClick={() => removeNotice(n.id)} style={{ ...linkBtn, color: "var(--danger)", fontWeight: 700 }}>Yes, remove</button>
                  <button onClick={() => setConfirmId(null)} style={{ ...linkBtn, color: "var(--text-dim)", fontWeight: 600 }}>Keep</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 18, marginTop: 4 }}>
                  <button onClick={() => { setEditingId(n.id); setEditDraft(n.content); setConfirmId(null) }} style={{ ...linkBtn, color: colour, fontWeight: 700 }}>Edit</button>
                  <button onClick={() => setConfirmId(n.id)} style={{ ...linkBtn, color: "var(--danger)", fontWeight: 600 }}>Remove</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {canPost && !composing && (
        <button onClick={() => setComposing(true)}
          style={{ padding: "0.4rem 0.9rem", borderRadius: 20, fontWeight: 700, fontFamily: "inherit", fontSize: "0.82rem", cursor: "pointer", whiteSpace: "nowrap", border: `1px dashed ${colour}`, background: "transparent", color: colour }}>
          📣 Notice to attendees
        </button>
      )}

      {canPost && composing && (
        <div style={{ border: `1px solid ${colour}`, borderRadius: 12, padding: "0.75rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: 6 }}>
            Goes to everyone booked on this event, including the waitlist.
          </div>
          <RichEditor key={`event-notice-${eventId}`} initialValue="" hubColour={colour}
            bg="card" onChange={setDraft} placeholder="Write a notice for this event's attendees…" />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => { setComposing(false); setDraft("") }} style={actionBtn(false)}>Cancel</button>
            <button onClick={postNotice} disabled={posting || !draft.trim()} style={actionBtn(true, posting || !draft.trim())}>{posting ? "Sending…" : "Send notice"}</button>
          </div>
        </div>
      )}
    </div>
  )
}
