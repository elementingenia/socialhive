"use client"
import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import { useOwners } from "@/lib/useOwners"
import { authedFetch, getAuthToken } from "@/lib/getAuthToken"
import RichEditor from "@/components/RichEditor"
import { ContactBar } from "@/components/OwnersManager"
import CommitteeNotifyToggle from "@/components/CommitteeNotifyToggle"
import { FormattedText } from "@/lib/textFormatter"
import { MAX_ATTACHMENT_BYTES, tooLargeMessage } from "@/lib/attachmentLimits"

const COLOUR = "var(--committee)"

function fmt(iso) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
}

// ── Welcome Banner (matches Movies/Social/Special Events pattern exactly —
// admin-editable via Page Texts, hub_settings.welcome_text). Committee's
// page previously never fetched or rendered this at all -- the hardcoded
// icon+title+description block below stood in its place, which is both
// the wrong content (not admin-editable, doesn't match what Page Texts'
// "Committee" row actually controls) and the wrong layout (every other
// hub starts with WelcomeBanner, not a static header). Iain, 2026-09-08:
// same class of gap as Special Events had. ──────────────────────────────
const WELCOME_KEY = "committee_welcome_dismissed"

function WelcomeBanner({ text }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(WELCOME_KEY) === "1" } catch { return false }
  })
  if (!text) return null
  if (dismissed) {
    return (
      <button onClick={() => setDismissed(false)} style={{
        display: "flex", alignItems: "center", gap: 6,
        background: "none", border: "none", color: COLOUR,
        fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
        padding: "0 0 0.75rem", fontFamily: "inherit",
      }}>
        <span style={{ fontSize: "1rem" }}>ℹ</span> Show welcome message
      </button>
    )
  }
  return (
    <div style={{
      background: COLOUR, borderRadius: 14,
      padding: "0.9rem 1rem", marginBottom: "1rem",
      position: "relative",
    }}>
      <div style={{ fontSize: "0.88rem", lineHeight: 1.55, color: "#fff", paddingRight: "1.5rem" }}>
        {/<[a-z][\s\S]*>/i.test(text)
          ? <span dangerouslySetInnerHTML={{ __html: text }} />
          : <FormattedText text={text} c1Colour="var(--committee)" c2Colour="rgba(255,255,255,0.85)" />
        }
      </div>
      <button onClick={() => {
        setDismissed(true)
        try { localStorage.setItem(WELCOME_KEY, "1") } catch {}
      }} style={{
        position: "absolute", top: 8, right: 10, background: "none", border: "none",
        color: "rgba(255,255,255,0.7)", fontSize: "1rem", cursor: "pointer", lineHeight: 1, padding: 4,
      }}>×</button>
    </div>
  )
}

// ── One post ─────────────────────────────────────────────────────────────
function PostCard({ post, canManage, onTogglePin, onArchive }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderLeft: `4px solid ${COLOUR}`, borderRadius: 10, padding: "0.9rem 1rem", marginBottom: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: COLOUR, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {post.pinned ? "📌 Pinned" : "Committee Update"}
        </span>
        <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
          {post.members?.name ? `${post.members.name} — ` : ""}{fmt(post.created_at)}
        </span>
      </div>
      <div style={{ fontSize: "0.9rem", color: "var(--text)", lineHeight: 1.55, marginTop: 6 }}>
        {/<[a-z][\s\S]*>/i.test(post.content)
          ? <span dangerouslySetInnerHTML={{ __html: post.content }} />
          : post.content}
      </div>
      {post.attachment_url && (
        <a href={post.attachment_url} target="_blank" rel="noreferrer" style={{
          display: "inline-block", marginTop: 8, fontSize: "0.82rem", fontWeight: 700,
          color: COLOUR, textDecoration: "underline",
        }}>
          📎 {post.attachment_name || "Attachment"}
        </a>
      )}
      {canManage && (
        <div style={{ display: "flex", gap: 12, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
          <button onClick={() => onTogglePin(post)} style={{
            background: "none", border: "none", color: COLOUR, fontSize: "0.78rem", fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit", padding: 0,
          }}>{post.pinned ? "Unpin" : "Pin"}</button>
          <button onClick={() => onArchive(post)} style={{
            background: "none", border: "none", color: "var(--danger)", fontSize: "0.78rem", fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit", padding: 0,
          }}>Remove</button>
        </div>
      )}
    </div>
  )
}

// ── Compose a new post (Owner/admin only) ──────────────────────────────────
//
// "Also file this in Documents" (Iain, 2026-09-08): when an attachment is
// selected, a second, clearly-optional block appears offering to also save
// it into Info > Documents under a chosen category -- one upload, two
// places to find it, instead of the poster having to attach it here AND
// separately re-upload it on the Documents screen. Left blank (no category
// chosen), behaviour is exactly as before: the file is only a post
// attachment. See app/api/committee/route.js POST for the server side.
function Composer({ onPosted }) {
  const [content, setContent] = useState("")
  const [file, setFile] = useState(null)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState("")

  const [docCategories, setDocCategories] = useState([])
  const [docCategoryId, setDocCategoryId] = useState("")
  const [docTitle, setDocTitle] = useState("")

  useEffect(() => {
    supabase.from("document_categories").select("id, name").eq("active", true)
      .order("display_order").then(({ data }) => setDocCategories(data || []))
  }, [])

  function pickFile(f) {
    setError("")
    if (f && f.size > MAX_ATTACHMENT_BYTES) { setError(tooLargeMessage(f)); return }
    setFile(f)
    if (f && !docTitle) setDocTitle(f.name.replace(/\.[^.]+$/, ""))
    if (!f) { setDocCategoryId(""); setDocTitle("") }
  }

  // Reads a JSON error body if there is one; falls back to a readable
  // message when the response isn't JSON at all (e.g. a plain-text 413
  // from Vercel's own request-size limit, which res.json() would otherwise
  // choke on with a cryptic "Unexpected token" parse error instead of
  // telling the person what actually happened).
  async function readError(res, fallback) {
    const text = await res.text()
    try { return JSON.parse(text).error || fallback } catch {
      if (res.status === 413) return "That file is too large to upload."
      return fallback
    }
  }

  async function submit() {
    if (!content.trim() || posting) return
    setPosting(true)
    setError("")
    try {
      const token = await getAuthToken()

      if (file && !file.type.startsWith("image/")) {
        // PDF/Word attachment -- signed-upload flow (see
        // app/api/committee/route.js's header comment for why this can't
        // go through a plain multipart POST the way an image attachment
        // does: a Word doc can't be shrunk server-side the way an image
        // is, so it needs to skip our own function entirely and go
        // straight to Storage).
        const signRes = await fetch("/api/committee", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "sign", file_name: file.name, content_type: file.type, file_size: file.size }),
        })
        if (!signRes.ok) throw new Error(await readError(signRes, "Could not prepare the upload"))
        const signData = await signRes.json()

        const { error: upErr } = await supabase.storage
          .from("community-docs")
          .uploadToSignedUrl(signData.path, signData.token, file, { contentType: signData.content_type })
        if (upErr) throw new Error(upErr.message || "Upload failed")

        const completeRes = await fetch("/api/committee", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            action: "complete", path: signData.path, file_name: file.name, content_type: signData.content_type,
            content, pinned: false,
            doc_category_id: docCategoryId || undefined, doc_title: docCategoryId ? docTitle.trim() : undefined,
          }),
        })
        if (!completeRes.ok) throw new Error(await readError(completeRes, "Could not post"))
      } else if (file) {
        // Image attachment -- still resized server-side, small enough to
        // go straight through the function.
        const fd = new FormData()
        fd.append("content", content)
        fd.append("file", file)
        if (docCategoryId) {
          fd.append("doc_category_id", docCategoryId)
          fd.append("doc_title", docTitle.trim())
        }
        const res = await fetch("/api/committee", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd })
        if (!res.ok) throw new Error(await readError(res, "Could not post"))
      } else {
        const res = await fetch("/api/committee", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ content }),
        })
        if (!res.ok) throw new Error(await readError(res, "Could not post"))
      }

      setContent(""); setFile(null); setDocCategoryId(""); setDocTitle("")
      onPosted()
    } catch (e) {
      setError(e.message)
    }
    setPosting(false)
  }

  return (
    <div style={{ border: `1px solid ${COLOUR}`, borderRadius: 12, padding: "0.75rem", marginBottom: 14 }}>
      <RichEditor key="committee-post" initialValue="" hubColour="#475569" bg="card"
        onChange={setContent} placeholder="Write a Committee update, notice, or share this month's minutes…" />
      <div style={{ marginTop: 8 }}>
        <label style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Attachment (optional)</label>
        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: 2 }}>
          PDF, Word, or image — max 10MB
        </div>
        <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
          onChange={e => pickFile(e.target.files[0] || null)}
          style={{ display: "block", marginTop: 4, fontSize: "0.85rem" }} />
      </div>

      {file && (
        <div style={{ marginTop: 10, padding: "0.6rem 0.7rem", background: "var(--surface2)", borderRadius: 10 }}>
          <label style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
            Also save this attachment in Documents (optional)
          </label>
          <select value={docCategoryId} onChange={e => setDocCategoryId(e.target.value)} style={{
            width: "100%", padding: "0.5rem", borderRadius: 8, border: "1px solid var(--border)",
            fontSize: "0.85rem", fontFamily: "inherit", background: "var(--surface)", color: "var(--text)",
          }}>
            <option value="">Don't add to Documents</option>
            {docCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {docCategoryId && (
            <input value={docTitle} onChange={e => setDocTitle(e.target.value)} placeholder="Document title"
              style={{
                width: "100%", marginTop: 6, padding: "0.5rem", borderRadius: 8, border: "1px solid var(--border)",
                fontSize: "0.85rem", fontFamily: "inherit", background: "var(--surface)", color: "var(--text)",
              }} />
          )}
        </div>
      )}

      {error && <div style={{ color: "#b91c1c", fontSize: "0.82rem", marginTop: 6 }}>{error}</div>}
      <button onClick={submit} disabled={posting || !content.trim()} style={{
        marginTop: 10, width: "100%", padding: "0.65rem", borderRadius: 10, border: "none",
        background: COLOUR, color: "#fff", fontWeight: 700, fontFamily: "inherit",
        cursor: (posting || !content.trim()) ? "not-allowed" : "pointer",
        opacity: (posting || !content.trim()) ? 0.6 : 1,
      }}>{posting ? "Posting…" : "Post update"}</button>
    </div>
  )
}

export default function CommitteePage() {
  const { member, isAdmin } = useUser()
  const { owners } = useOwners("hub", "committee")
  const isOwner = !!member?.id && owners.some(o => o.id === member.id)
  const canManage = isAdmin || isOwner

  const [posts, setPosts] = useState([])
  const [welcomeText, setWelcomeText] = useState("")
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const load = useCallback(async () => {
    const [postsRes, hubRes] = await Promise.all([
      authedFetch("/api/committee").catch(() => null),
      supabase.from("hub_settings").select("welcome_text").eq("hub_type", "committee").single(),
    ])
    const data = postsRes ? await postsRes.json().catch(() => ({})) : {}
    setPosts(data.posts || [])
    setWelcomeText(hubRes.data?.welcome_text || "")
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  async function togglePin(post) {
    const res = await authedFetch("/api/committee", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: post.id, pinned: !post.pinned }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); flash(d.error || "Could not update"); return }
    load()
  }

  async function archive(post) {
    if (!confirm("Remove this update?")) return
    const res = await authedFetch("/api/committee", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: post.id }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); flash(d.error || "Could not remove"); return }
    load()
  }

  if (loading) return (
    <div style={{ padding: "1.25rem 1rem" }}>
      {[1, 2, 3].map(i => <div key={i} style={{ height: 90, borderRadius: 12, background: "var(--surface2)", marginBottom: "0.6rem" }} />)}
    </div>
  )

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      {toast && <div style={{ position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "var(--text)", color: "var(--bg)", padding: "0.5rem 1rem", borderRadius: 8, fontSize: "0.85rem", fontWeight: 600 }}>{toast}</div>}

      <WelcomeBanner text={welcomeText} />

      <ContactBar contextType="hub" contextKey="committee" contextLabel="Committee" colour={COLOUR}
        style={{ margin: "-2px 0 12px" }}
        right={<CommitteeNotifyToggle colour={COLOUR} />} />

      {canManage && <Composer onPosted={load} />}

      {posts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem 1rem", color: "var(--text-dim)", fontSize: "0.9rem" }}>
          No Committee updates yet
        </div>
      ) : (
        posts.map(post => (
          <PostCard key={post.id} post={post} canManage={canManage}
            onTogglePin={togglePin} onArchive={archive} />
        ))
      )}
    </div>
  )
}
