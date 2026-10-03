"use client"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@/lib/UserContext"
import { authedFetch } from "@/lib/getAuthToken"
import { MAX_STEPS, nextSendLabel, featureDateLabel } from "@/lib/newFeatures"

// Admin > New Features (Scope_Answered, Iain 2026-10-03). Admin-only.
// - Master switch + audience (decision 6: starts Off, Admins only).
// - Drafts: edit, Preview PDF (the real template), Approve / Reject.
//   Nothing reaches residents without Approve (decision 2).
// - Approved items go out together at 08:30 Sydney the next morning
//   (app/api/cron/new-features-announce) as one PDF in Documents > New
//   Features plus one notification (decision 1).
// - History of past announcements with their PDFs.

const inputStyle = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box",
  fontFamily: "inherit",
}
const labelStyle = { fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", margin: "0.7rem 0 0.3rem", display: "block" }
const card = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "1rem", marginBottom: "0.75rem" }
const pill = (bg, color = "#fff", border = "none") => ({
  padding: "0.5rem 0.9rem", borderRadius: 10, border, background: bg, color, fontFamily: "inherit",
  fontSize: "0.85rem", fontWeight: 700, cursor: "pointer",
})

const EMPTY = { title: "", summary: "", what_it_does: "", how_to_use: "", where_to_find: "", source_ref: "" }
const toForm = f => ({
  title: f.title || "", summary: f.summary || "", what_it_does: f.what_it_does || "",
  how_to_use: (Array.isArray(f.how_to_use) ? f.how_to_use : []).join("\n"),
  where_to_find: f.where_to_find || "", source_ref: f.source_ref || "",
})

function DraftForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const steps = form.how_to_use.split("\n").filter(s => s.trim()).length
  const okTitle = !!form.title.trim(), okSummary = !!form.summary.trim()
  return (
    <div>
      <label style={labelStyle}>Feature name *</label>
      <input value={form.title} onChange={e => set("title", e.target.value)} maxLength={120}
        placeholder="e.g. Search in Documents"
        style={{ ...inputStyle, border: `1.5px solid ${okTitle ? "var(--green)" : "var(--danger)"}` }} />
      <label style={labelStyle}>One-line summary *</label>
      <input value={form.summary} onChange={e => set("summary", e.target.value)} maxLength={300}
        placeholder="What a resident gets, in one sentence"
        style={{ ...inputStyle, border: `1.5px solid ${okSummary ? "var(--green)" : "var(--danger)"}` }} />
      <label style={labelStyle}>What it does</label>
      <textarea value={form.what_it_does} onChange={e => set("what_it_does", e.target.value)} rows={3} maxLength={1500}
        style={{ ...inputStyle, resize: "vertical" }} />
      <label style={labelStyle}>How to use it — one step per line (up to {MAX_STEPS})</label>
      <textarea value={form.how_to_use} onChange={e => set("how_to_use", e.target.value)} rows={4}
        placeholder={"Open Info, then Documents.\nTap the search box at the top."}
        style={{ ...inputStyle, resize: "vertical" }} />
      {steps > MAX_STEPS && (
        <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: 4 }}>
          Only the first {MAX_STEPS} steps will be used.
        </div>
      )}
      <label style={labelStyle}>Where to find it</label>
      <input value={form.where_to_find} onChange={e => set("where_to_find", e.target.value)} maxLength={300}
        placeholder="e.g. Info › Documents, top of the page" style={inputStyle} />
      <label style={labelStyle}>Reference (not shown to residents)</label>
      <input value={form.source_ref} onChange={e => set("source_ref", e.target.value)} maxLength={60}
        placeholder="e.g. PR #185" style={inputStyle} />
      <div style={{ display: "flex", gap: 8, marginTop: "0.9rem", flexWrap: "wrap" }}>
        <button type="button" disabled={saving || !okTitle || !okSummary} onClick={() => onSave(form)}
          style={{ ...pill("var(--teal)"), opacity: saving || !okTitle || !okSummary ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} style={pill("var(--surface)", "var(--text-dim)", "1px solid var(--border)")}>Cancel</button>
      </div>
    </div>
  )
}

function FeatureCard({ f, busy, onEdit, onAction, onPreview }) {
  const approved = f.status === "approved"
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: "var(--text)" }}>{f.title}</div>
          <div style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: 2 }}>{f.summary}</div>
          {f.source_ref && <div style={{ color: "var(--text-dim)", fontSize: "0.75rem", marginTop: 4 }}>{f.source_ref}</div>}
        </div>
        <span style={{
          flexShrink: 0, fontSize: "0.75rem", fontWeight: 700, padding: "0.25rem 0.6rem", borderRadius: 999,
          background: approved ? "var(--green)" : "var(--amber)", color: "#fff",
        }}>{approved ? "Approved" : "Draft"}</span>
      </div>
      {approved && <div style={{ fontSize: "0.8rem", color: "var(--green)", marginTop: 6, fontWeight: 600 }}>{nextSendLabel()}</div>}
      <div style={{ display: "flex", gap: 6, marginTop: "0.75rem", flexWrap: "wrap" }}>
        <button type="button" disabled={busy} onClick={onPreview} style={pill("var(--surface)", "var(--text)", "1px solid var(--border)")}>Preview PDF</button>
        <button type="button" disabled={busy} onClick={onEdit} style={pill("var(--surface)", "var(--text)", "1px solid var(--border)")}>Edit</button>
        {approved
          ? <button type="button" disabled={busy} onClick={() => onAction("unapprove")} style={pill("var(--surface)", "var(--text)", "1px solid var(--border)")}>Back to draft</button>
          : <button type="button" disabled={busy} onClick={() => onAction("approve")} style={pill("var(--teal)")}>Approve</button>}
        <button type="button" disabled={busy} onClick={() => onAction("reject")} style={pill("var(--surface)", "#991b1b", "1px solid #fca5a5")}>Reject</button>
      </div>
    </div>
  )
}

export default function NewFeaturesAdminPage() {
  const { member, loading } = useUser()
  const router = useRouter()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [editing, setEditing] = useState(null) // null | "new" | id

  useEffect(() => {
    if (!loading && !member?.is_admin) router.replace("/home")
  }, [loading, member, router])

  const load = useCallback(async () => {
    try {
      const res = await authedFetch("/api/admin/new-features")
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || "Couldn't load New Features")
      setData(d)
    } catch (err) { setError(err.message); setData(d => d || { settings: {}, open: [], history: [] }) }
  }, [])
  useEffect(() => { if (member?.is_admin) load() }, [member, load])

  if (loading || !member?.is_admin) return null

  async function call(method, body, id = "settings") {
    setBusyId(id); setError(null)
    try {
      const res = await authedFetch("/api/admin/new-features", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || "Something went wrong")
      await load()
      return true
    } catch (err) { setError(err.message); return false } finally { setBusyId(null) }
  }

  async function preview(f) {
    setBusyId(f.id); setError(null)
    try {
      const res = await authedFetch(`/api/admin/new-features?preview=${f.id}`)
      if (!res.ok) throw new Error("Couldn't build the preview")
      const url = URL.createObjectURL(await res.blob())
      router.push(`/documents/view?url=${encodeURIComponent(url)}&name=${encodeURIComponent("New Features preview.pdf")}`)
    } catch (err) { setError(err.message) } finally { setBusyId(null) }
  }

  const s = data?.settings || {}
  const on = !!s.enabled
  const audience = s.audience === "community" ? "community" : "admins"
  const open = data?.open || []
  const history = data?.history || []

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.25rem 1rem 6rem" }}>
      <h1 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 0.25rem" }}>New Features</h1>
      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", margin: "0 0 1rem" }}>
        Approve what's been delivered. Everything approved goes out together at 8:30am as one PDF in
        Documents › New Features, with one notification.
      </p>

      {/* Master switch + audience */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: "var(--teal)" }}>Daily announcement</div>
            <div style={{ color: "var(--text-dim)", fontSize: "0.82rem" }}>
              {on ? "On — approved features go out at 8:30am." : "Off — nothing is sent, even if approved."}
            </div>
          </div>
          <button type="button" role="switch" aria-checked={on} aria-label="Daily announcement on or off"
            disabled={!data || busyId === "settings"} onClick={() => call("PATCH", { settings: { enabled: !on } })}
            style={{
              flexShrink: 0, width: 50, height: 28, borderRadius: 14, border: "none", position: "relative",
              background: on ? "var(--teal)" : "var(--border)", cursor: "pointer",
              opacity: !data || busyId === "settings" ? 0.6 : 1, transition: "background 0.2s",
            }}>
            <span style={{
              position: "absolute", top: 3, left: on ? 25 : 3, width: 22, height: 22, borderRadius: "50%",
              background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)", transition: "left 0.2s",
            }} />
          </button>
        </div>
        <div style={{ marginTop: "0.8rem" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.35rem" }}>Who gets it</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[["admins", "Admins only"], ["community", "Community wide"]].map(([key, label]) => {
              const active = audience === key
              return (
                <button key={key} type="button" aria-pressed={active}
                  disabled={!data || busyId === "settings"}
                  onClick={() => active || call("PATCH", { settings: { audience: key } })}
                  style={{
                    flex: 1, padding: "0.55rem 0.5rem", borderRadius: 10, fontFamily: "inherit",
                    fontSize: "0.88rem", fontWeight: 700, cursor: "pointer",
                    border: `1px solid ${active ? "var(--teal)" : "var(--border)"}`,
                    background: active ? "var(--teal)" : "var(--surface)",
                    color: active ? "#fff" : "var(--text-dim)",
                    opacity: !data || busyId === "settings" ? 0.6 : 1,
                  }}>{label}</button>
              )
            })}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.35rem" }}>
            {audience === "admins"
              ? "Only admins are notified — use this to trial it. The PDF is still filed in Documents."
              : "Every resident is notified."}
          </div>
        </div>
        {data && !s.ready && (
          <div style={{ color: "var(--danger)", fontSize: "0.8rem", marginTop: "0.5rem" }}>
            Setup isn't finished (migration 123 hasn't run).
          </div>
        )}
      </div>

      {error && <div style={{ color: "var(--danger)", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>{error}</div>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "1.25rem 0 0.6rem", gap: 8 }}>
        <h2 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0 }}>Waiting</h2>
        {editing !== "new" && (
          <button type="button" onClick={() => setEditing("new")} style={pill("var(--teal)")}>+ New</button>
        )}
      </div>

      {editing === "new" && (
        <div style={card}>
          <DraftForm initial={EMPTY} saving={busyId === "new"} onCancel={() => setEditing(null)}
            onSave={async form => { if (await call("POST", form, "new")) setEditing(null) }} />
        </div>
      )}

      {!data ? (
        <div style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>Loading…</div>
      ) : open.length === 0 && editing !== "new" ? (
        <div style={{ color: "var(--text-dim)", fontSize: "0.9rem", padding: "0.5rem 0 1rem" }}>Nothing waiting for approval.</div>
      ) : open.map(f => editing === f.id ? (
        <div key={f.id} style={card}>
          <DraftForm initial={toForm(f)} saving={busyId === f.id} onCancel={() => setEditing(null)}
            onSave={async form => { if (await call("PATCH", { id: f.id, fields: form }, f.id)) setEditing(null) }} />
        </div>
      ) : (
        <FeatureCard key={f.id} f={f} busy={busyId === f.id}
          onEdit={() => setEditing(f.id)} onPreview={() => preview(f)}
          onAction={action => {
            if (action === "reject" && !confirm(`Reject "${f.title}"? It won't be announced.`)) return
            call("PATCH", { id: f.id, action }, f.id)
          }} />
      ))}

      {history.length > 0 && (
        <>
          <h2 style={{ fontSize: "1.05rem", fontWeight: 800, margin: "1.5rem 0 0.6rem" }}>Sent</h2>
          {history.map(f => (
            <div key={f.id} style={{ ...card, padding: "0.75rem 1rem" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0, fontWeight: 700 }}>{f.title}</div>
                <div style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>{featureDateLabel(f.announced_on)}</div>
              </div>
              {f.document?.file_url && (
                <button type="button"
                  onClick={() => router.push(`/documents/view?url=${encodeURIComponent(f.document.file_url)}&name=${encodeURIComponent((f.document.title || "New Features") + ".pdf")}`)}
                  style={{ ...pill("none", "var(--teal)"), padding: "0.3rem 0", marginTop: 4 }}>Open PDF</button>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
