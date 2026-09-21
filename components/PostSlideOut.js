"use client"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useUser } from "@/lib/UserContext"
import { authedFetch } from "@/lib/getAuthToken"
import AskQuestion from "@/components/AskQuestion"
import { QuestionIcon } from "@/components/NavIcons"
import ImageCarouselModal from "@/components/ImageCarouselModal"
import HappeningsNewsComposer from "@/components/HappeningsNewsComposer"
import { MAX_CONTENT_LENGTH } from "@/lib/happeningsNewsTier"

// Full-post view -- "a modal like the booking form slides out with the full
// post, including a grid of the images" (Iain, 2026-09-21). Same shell
// mechanics as components/EventSlideOut.js (Portal, 280ms translateX,
// backdrop-dismiss, body-scroll-lock, sticky header) -- deliberately a NEW,
// much smaller component rather than extending that 2900-line file, since a
// Happenings News post shares none of EventSlideOut's booking/coordinator
// machinery, only its slide-out shell.
function Portal({ children }) {
  if (typeof document === "undefined") return null
  return createPortal(children, document.body)
}

function fmtDateTime(iso) {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) +
    " at " + d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })
}

export default function PostSlideOut({ postId, onClose, onChanged }) {
  const { member, isAdmin } = useUser()
  const [open, setOpen] = useState(false)
  const [post, setPost] = useState(undefined) // undefined = loading, null = not found
  const [carouselIndex, setCarouselIndex] = useState(null) // index into post.photos, or null = closed
  const [managingPhotos, setManagingPhotos] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!postId) { setOpen(false); return }
    setTimeout(() => setOpen(true), 16)
    load()
  }, [postId])

  useEffect(() => {
    if (!postId) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prevOverflow }
  }, [postId])

  async function load() {
    const res = await fetch(`/api/happenings-news/${postId}`)
    const json = await res.json().catch(() => ({}))
    setPost(res.ok ? json : null)
    setDraft(json?.content || "")
  }

  function handleClose() {
    setOpen(false)
    setTimeout(onClose, 280)
  }

  if (!postId) return null

  const canManage = !!member && (isAdmin || member.id === post?.poster_member_id) // fine-grained Owner/EC check happens server-side on save; this just shows/hides the Edit UI

  async function saveEdit() {
    setError(""); setSaving(true)
    const res = await authedFetch(`/api/happenings-news/${postId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(json.error || "Could not save"); return }
    setEditing(false)
    await load()
    onChanged?.()
  }

  async function deletePost() {
    if (!confirm("Delete this Happenings News post? This can't be undone.")) return
    setSaving(true)
    const res = await authedFetch(`/api/happenings-news/${postId}`, { method: "DELETE" })
    setSaving(false)
    if (!res.ok) { const json = await res.json().catch(() => ({})); setError(json.error || "Could not delete"); return }
    onChanged?.()
    handleClose()
  }

  return (
    <Portal>
      <div onClick={handleClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300,
        opacity: open ? 1 : 0, transition: "opacity 0.25s ease" }} />

      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(460px, 96vw)",
        background: "var(--surface)", zIndex: 301, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.15)", paddingBottom: 32 }}>

        <div style={{ height: 6, background: "var(--happenings-news)" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px",
          borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--happenings-news)" }}>Happenings News</div>
          <button onClick={handleClose} style={{ background: "var(--surface2)", border: "none", borderRadius: "50%",
            width: 36, height: 36, fontSize: 20, cursor: "pointer", color: "var(--text)",
            display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        <div style={{ padding: "16px 16px 0" }}>
          {post === undefined ? (
            <div style={{ padding: "3rem 0", textAlign: "center", color: "var(--text-dim)" }}><div className="spinner" /></div>
          ) : post === null ? (
            <div style={{ padding: "2rem 0", textAlign: "center", color: "var(--text-dim)" }}>This post couldn&apos;t be found.</div>
          ) : (
            <>
              <h2 style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.3, marginBottom: 6 }}>{post.event?.title || "Event recap"}</h2>

              {/* Public attribution -- "as" (Ask) icon + bold clickable poster
                  name, same visual language as ContactBar's Coordinator
                  treatment (Iain, 2026-09-21: "This is like the Coordinator
                  and should have the 'as' icon and coordinator name bolded
                  as clickable for ask a question"). Name/date/time are
                  PUBLIC here -- reversed from the old Noticeboard's
                  Admin/Owner-only masking. Routed as contextType="event"
                  (not a "member" context -- that type doesn't exist in
                  lib/questionRouting.js) so it lands with this event's real
                  answerer set (eventNotifyRecipients -- includes the EC,
                  i.e. this post's own poster), matching how every other
                  "ask about this event" entry point in the app already
                  works. */}
              <AskQuestion contextType="event" contextKey={post.event_id} contextLabel={post.event?.title || post.poster_name}
                trigger={(openAsk) => (
                  <button onClick={openAsk} style={{
                    display: "flex", alignItems: "center", gap: "0.5rem", background: "none", border: "none",
                    padding: "0.3rem", margin: "-0.3rem 0 0.6rem", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  }}>
                    <span aria-hidden style={{ flex: "none", width: 22, height: 22, borderRadius: "50%",
                      background: "var(--happenings-news)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <QuestionIcon size={12} />
                    </span>
                    <span style={{ fontSize: "0.82rem", color: "var(--text-dim)" }}>
                      <strong style={{ color: "var(--happenings-news)" }}>{post.poster_name}</strong> · {fmtDateTime(post.created_at)}
                      {post.edited_at ? " (edited)" : ""}
                    </span>
                  </button>
                )} />

              {/* Photo grid */}
              {post.photos?.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 14 }}>
                  {post.photos.map((p, i) => (
                    <button key={p.id} onClick={() => setCarouselIndex(i)} style={{
                      padding: 0, border: "none", borderRadius: 8, overflow: "hidden", cursor: "pointer",
                      aspectRatio: "1 / 1", position: "relative",
                    }}>
                      <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      {p.is_primary && (
                        <span style={{ position: "absolute", top: 4, left: 4, background: "var(--happenings-news)", color: "#fff",
                          fontSize: "0.6rem", fontWeight: 700, padding: "1px 6px", borderRadius: 999 }}>★ Headline</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Article text */}
              {editing ? (
                <div style={{ marginBottom: 14 }}>
                  <textarea value={draft} onChange={e => setDraft(e.target.value)} maxLength={MAX_CONTENT_LENGTH}
                    rows={8} style={{ width: "100%", padding: "0.75rem", borderRadius: 10, border: "1px solid var(--border)",
                      background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", fontSize: "0.9rem", resize: "vertical", boxSizing: "border-box" }} />
                  <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", textAlign: "right", marginTop: 2 }}>{draft.length} / {MAX_CONTENT_LENGTH}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={() => { setEditing(false); setDraft(post.content) }} style={{ flex: 1, padding: "0.6rem", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                    <button onClick={saveEdit} disabled={saving} style={{ flex: 1, padding: "0.6rem", borderRadius: 10, border: "none", background: "var(--happenings-news)", color: "#fff", cursor: "pointer", fontWeight: 700 }}>{saving ? "Saving…" : "Save"}</button>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: "0.92rem", lineHeight: 1.6, color: "var(--text)", whiteSpace: "pre-wrap", marginBottom: 14 }}>{post.content}</p>
              )}

              {error && <div style={{ color: "var(--terracotta)", fontSize: "0.82rem", marginBottom: 10 }}>{error}</div>}

              {canManage && !editing && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setEditing(true)} style={{ flex: 1, padding: "0.6rem", borderRadius: 10, border: "1px solid var(--happenings-news)", background: "transparent", color: "var(--happenings-news)", cursor: "pointer", fontWeight: 700 }}>Edit text</button>
                    <button onClick={() => setManagingPhotos(true)} style={{ flex: 1, padding: "0.6rem", borderRadius: 10, border: "1px solid var(--happenings-news)", background: "transparent", color: "var(--happenings-news)", cursor: "pointer", fontWeight: 700 }}>Manage photos</button>
                  </div>
                  <button onClick={deletePost} disabled={saving} style={{ padding: "0.6rem", borderRadius: 10, border: "1px solid var(--terracotta)", background: "transparent", color: "var(--terracotta)", cursor: "pointer", fontWeight: 700 }}>Delete post</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {carouselIndex !== null && post?.photos?.length > 0 && (
        <ImageCarouselModal photos={post.photos} startIndex={carouselIndex} onClose={() => setCarouselIndex(null)} />
      )}

      {managingPhotos && (
        <HappeningsNewsComposer postId={postId} onClose={() => setManagingPhotos(false)}
          onSaved={() => { setManagingPhotos(false); load(); onChanged?.() }} />
      )}
    </Portal>
  )
}
