"use client"
import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { authedFetch } from "@/lib/getAuthToken"
import RichEditor from "@/components/RichEditor"
import { hubHasNotices } from "@/lib/hubNotices"
import { isHtmlContent } from "@/lib/richText"

// Hub notices (Iain, 2026-09-23) -- the hub equivalent of Groups & Clubs'
// notices (components/ClubHome.js ClubSocial), same look and behaviour:
// admin or this hub's Owner gets a "📣 Post notice" pill; posting notifies
// everyone who has Joined the hub (hub_followers). Everyone can read notices.
// Only hubs with members get this (lib/hubNotices.js) -- never Social/Special.
//
// Vertical space: renders nothing at all for a resident when there are no
// notices, and nothing for anyone on a hub without members.
export default function HubNotices({ hubType, colour = "var(--teal)", canPost = false }) {
  const [notices, setNotices]     = useState([])
  const [composing, setComposing] = useState(false)
  const [draft, setDraft]         = useState("")
  const [posting, setPosting]     = useState(false)
  const [confirmId, setConfirmId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState("")
  const [saving, setSaving]       = useState(false)
  const [toast, setToast]         = useState(null)
  const enabled = hubHasNotices(hubType)

  const load = useCallback(() => {
    if (!enabled) return
    supabase.from("hub_notices").select("id, content, created_at")
      .eq("hub_type", hubType).eq("archived", false).order("created_at", { ascending: false })
      .then(({ data }) => setNotices(data || []))
  }, [hubType, enabled])
  useEffect(() => { load() }, [load])

  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  async function postNotice() {
    if (!draft.trim() || posting) return
    setPosting(true)
    try {
      const res = await authedFetch("/api/hub-notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hub_type: hubType, content: draft }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { flash(data.error || "Could not post"); return }
      setDraft(""); setComposing(false); load()
      flash(data.notified ? `Posted — ${data.notified} member${data.notified !== 1 ? "s" : ""} notified` : "Posted")
    } finally {
      setPosting(false)
    }
  }

  async function removeNotice(id) {
    setConfirmId(null)
    const res = await authedFetch("/api/hub-notices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      flash(d.error || "Could not remove notice")
    }
    load()
  }

  // Edit a notice in place (Iain, 2026-09-24). Saves quietly -- members are
  // not re-notified for an edit (see PATCH in app/api/hub-notices).
  async function saveEdit() {
    if (!editDraft.trim() || saving) return
    setSaving(true)
    try {
      const res = await authedFetch("/api/hub-notices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, content: editDraft }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { flash(d.error || "Could not save changes"); return }
      setEditingId(null); setEditDraft(""); load(); flash("Notice updated")
    } finally {
      setSaving(false)
    }
  }

  if (!enabled) return null
  if (!canPost && notices.length === 0) return null

  const fmt = (iso) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" })
  const pill = { padding: "0.4rem 0.9rem", borderRadius: 20, fontWeight: 700, fontFamily: "inherit", fontSize: "0.82rem", cursor: "pointer", whiteSpace: "nowrap" }

  return (
    <div style={{ marginBottom: 12 }}>
      {toast && <div style={{ position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "var(--text)", color: "var(--bg)", padding: "0.5rem 1rem", borderRadius: 8, fontSize: "0.85rem", fontWeight: 600 }}>{toast}</div>}

      {canPost && !composing && (
        <div style={{ marginBottom: notices.length ? 8 : 0 }}>
          <button onClick={() => setComposing(true)}
            style={{ ...pill, border: `1px dashed ${colour}`, background: "transparent", color: colour }}>
            📣 Post notice
          </button>
        </div>
      )}

      {canPost && composing && (
        <div style={{ marginBottom: 8, border: `1px solid ${colour}`, borderRadius: 12, padding: "0.75rem" }}>
          <RichEditor key={`hub-notice-${hubType}`} initialValue="" hubColour={colour}
            bg="card" onChange={setDraft} placeholder="Write a notice for this hub's members…" />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => { setComposing(false); setDraft("") }} style={{ flex: 1, padding: "0.6rem", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>Cancel</button>
            <button onClick={postNotice} disabled={posting || !draft.trim()} style={{ flex: 2, padding: "0.6rem", borderRadius: 10, border: "none", background: colour, color: "#fff", fontWeight: 700, fontFamily: "inherit", cursor: (posting || !draft.trim()) ? "not-allowed" : "pointer", opacity: (posting || !draft.trim()) ? 0.6 : 1 }}>{posting ? "Posting…" : "Post notice"}</button>
          </div>
        </div>
      )}

      {notices.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notices.map(n => (
            <div key={n.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${colour}`, borderRadius: 10, padding: "0.75rem 0.9rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: colour, textTransform: "uppercase", letterSpacing: "0.04em" }}>📣 Notice</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>{fmt(n.created_at)}</span>
              </div>
              {editingId === n.id ? (
                <div style={{ marginTop: 6 }}>
                  <RichEditor key={`hub-notice-edit-${n.id}`} initialValue={n.content} hubColour={colour}
                    bg="card" onChange={setEditDraft} placeholder="Notice text…" />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={() => { setEditingId(null); setEditDraft("") }} style={{ flex: 1, padding: "0.6rem", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>Cancel</button>
                    <button onClick={saveEdit} disabled={saving || !editDraft.trim()} style={{ flex: 2, padding: "0.6rem", borderRadius: 10, border: "none", background: colour, color: "#fff", fontWeight: 700, fontFamily: "inherit", cursor: (saving || !editDraft.trim()) ? "not-allowed" : "pointer", opacity: (saving || !editDraft.trim()) ? 0.6 : 1 }}>{saving ? "Saving…" : "Save changes"}</button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: "0.88rem", color: "var(--text)", lineHeight: 1.5, marginTop: 4 }}>
                  {isHtmlContent(n.content)
                    ? <span dangerouslySetInnerHTML={{ __html: n.content }} />
                    : n.content}
                </div>
              )}
              {canPost && editingId !== n.id && (confirmId === n.id ? (
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>Remove this notice?</span>
                  <button onClick={() => removeNotice(n.id)} style={{ background: "none", border: "none", color: "var(--danger)", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Yes, remove</button>
                  <button onClick={() => setConfirmId(null)} style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Keep</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                  <button onClick={() => { setEditingId(n.id); setEditDraft(n.content); setConfirmId(null) }} style={{ background: "none", border: "none", color: colour, fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Edit</button>
                  <button onClick={() => setConfirmId(n.id)} style={{ background: "none", border: "none", color: "var(--danger)", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Remove</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
