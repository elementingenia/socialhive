"use client"
import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import { useOwners } from "@/lib/useOwners"
import { authedFetch, getAuthToken } from "@/lib/getAuthToken"
import RichEditor from "@/components/RichEditor"
import { ContactBar } from "@/components/OwnersManager"
import CommitteeNotifyToggle from "@/components/CommitteeNotifyToggle"
import { CommitteeIcon } from "@/components/NavIcons"

const COLOUR = "var(--committee)"

function fmt(iso) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
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
function Composer({ onPosted }) {
  const [content, setContent] = useState("")
  const [file, setFile] = useState(null)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState("")

  async function submit() {
    if (!content.trim() || posting) return
    setPosting(true)
    setError("")
    try {
      const token = await getAuthToken()
      let res
      if (file) {
        const fd = new FormData()
        fd.append("content", content)
        fd.append("file", file)
        res = await fetch("/api/committee", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd })
      } else {
        res = await fetch("/api/committee", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ content }),
        })
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not post")
      setContent(""); setFile(null)
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
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={e => setFile(e.target.files[0] || null)}
          style={{ display: "block", marginTop: 4, fontSize: "0.85rem" }} />
      </div>
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

// ── Committee Meeting Minutes — read-only inline pull of the Documents
// "Committee Meetings" category (per decision 5: the upload UI stays on the
// Documents screen with widened permissions, not duplicated here). ────────
function MeetingMinutes() {
  const [docs, setDocs] = useState(null)

  useEffect(() => {
    supabase.from("documents")
      .select("id, title, file_url, file_name, active, category:document_categories!inner(name)")
      .eq("active", true).eq("document_categories.name", "Committee Meetings")
      .order("created_at", { ascending: false })
      .then(({ data }) => setDocs(data || []))
  }, [])

  if (!docs || docs.length === 0) return null
  return (
    <div style={{ marginTop: 18, marginBottom: 14 }}>
      <div style={{ fontWeight: 800, fontSize: "0.9rem", color: "var(--text)", marginBottom: 8 }}>
        Committee Meeting Minutes
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {docs.map(d => (
          <a key={d.id} href={d.file_url} target="_blank" rel="noreferrer" style={{
            display: "block", background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "0.6rem 0.85rem", fontSize: "0.85rem", fontWeight: 600,
            color: "var(--text)", textDecoration: "none",
          }}>
            📄 {d.title}
          </a>
        ))}
      </div>
    </div>
  )
}

export default function CommitteePage() {
  const { member, isAdmin } = useUser()
  const { owners } = useOwners("hub", "committee")
  const isOwner = !!member?.id && owners.some(o => o.id === member.id)
  const canManage = isAdmin || isOwner

  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const load = useCallback(async () => {
    const res = await authedFetch("/api/committee").catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    setPosts(data.posts || [])
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

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ color: COLOUR, lineHeight: 0 }}><CommitteeIcon size={34} /></span>
        <div>
          <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text)" }}>Committee</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Notices, updates, and meeting minutes from your Committee</div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <CommitteeNotifyToggle colour={COLOUR} />
      </div>

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

      <MeetingMinutes />

      <ContactBar contextType="hub" contextKey="committee" contextLabel="Committee" colour={COLOUR}
        style={{ marginTop: 16 }} />
    </div>
  )
}
