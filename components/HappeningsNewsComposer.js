"use client"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { authedFetch } from "@/lib/getAuthToken"
import { MAX_CONTENT_LENGTH, MAX_PHOTOS_PER_POST } from "@/lib/happeningsNewsTier"

// Composer modal -- creates a NEW post (eventId given, postId not yet
// known) or manages an EXISTING post's photos (postId given directly, e.g.
// reopened from PostSlideOut's "Manage photos" link). Text + up to 10
// photos, one nominated primary/headline (Iain, 2026-09-21: "The
// coordinator needs to nominate the primary photo for the article which
// determines which one is displayed in the news headline").
function Portal({ children }) {
  if (typeof document === "undefined") return null
  return createPortal(children, document.body)
}

export default function HappeningsNewsComposer({ eventId, postId: initialPostId, onClose, onSaved }) {
  const [postId, setPostId] = useState(initialPostId || null)
  const [content, setContent] = useState("")
  const [photos, setPhotos] = useState([]) // [{id, url, is_primary}]
  const [primaryPhotoId, setPrimaryPhotoId] = useState(null)
  const [step, setStep] = useState(initialPostId ? "photos" : "text") // 'text' first for a brand-new post
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!initialPostId) return
    fetch(`/api/happenings-news/${initialPostId}`).then(r => r.json()).then(json => {
      setContent(json.content || "")
      setPhotos(json.photos || [])
      setPrimaryPhotoId(json.primary_photo_id || null)
    })
  }, [initialPostId])

  async function createPost() {
    if (!content.trim()) { setError("Write something about the event first."); return }
    setError(""); setBusy(true)
    let res
    try {
      res = await authedFetch("/api/happenings-news", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, content }),
      })
    } catch (err) {
      // Network failure (offline, timeout, proxy drop) never reached the
      // server at all -- previously this threw uncaught and the modal just
      // sat there with no feedback. Log the real error for diagnosis (Iain,
      // 2026-09-22: several posts created "successfully" in the UI never
      // actually persisted -- with no error shown, there was nothing to go
      // on). console.error survives to devtools even though this UI only
      // shows a friendly message.
      setBusy(false); console.error("Happenings News create failed (network):", err)
      setError("Couldn't reach the server -- check your connection and try again.")
      return
    }
    const rawText = await res.text()
    let json = {}
    try { json = rawText ? JSON.parse(rawText) : {} } catch { /* non-JSON response, handled below */ }
    setBusy(false)
    if (!res.ok) {
      console.error("Happenings News create failed:", res.status, rawText)
      setError(json.error || `Could not create the post (server said ${res.status})`)
      return
    }
    if (!json.id) {
      // The server said 200 OK but didn't hand back a post id -- this is
      // exactly the silent-failure shape Iain hit: the UI would previously
      // sail on to the photos step as if it worked, then the post was
      // nowhere to be found afterward. Never proceed on a response we can't
      // actually use.
      console.error("Happenings News create: 200 OK but no id in response:", rawText)
      setError("The server didn't confirm the post was saved -- nothing has been posted. Please try again, and if this keeps happening, check the browser console (F12) for the logged error.")
      return
    }
    setPostId(json.id)
    setStep("photos")
  }

  async function uploadPhoto(file) {
    const fd = new FormData()
    fd.append("post_id", postId)
    fd.append("file", file)
    const res = await authedFetch("/api/happenings-news/photos", { method: "POST", body: fd })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || "Could not upload that photo")
    return json
  }

  // Handles a multi-select from the file picker (Iain, 2026-09-22: "upload
  // only allows one image at a time -- can this be multiple?"). Uploads
  // sequentially rather than in parallel -- the API auto-nominates the
  // first photo of a post as primary purely by upload order (see
  // app/api/happenings-news/photos/route.js), so parallel requests could
  // race and leave the wrong photo as headline. Stops at the 10-photo cap
  // (using a local running count, since setPhotos hasn't re-rendered mid-loop)
  // and reports how many made it in if the batch was trimmed or one failed.
  async function uploadPhotos(files) {
    setError(""); setBusy(true)
    let count = photos.length
    let uploaded = 0
    for (const file of files) {
      if (count >= MAX_PHOTOS_PER_POST) {
        setError(`Only added ${uploaded} of ${files.length} -- a post can have at most ${MAX_PHOTOS_PER_POST} photos`)
        break
      }
      try {
        const json = await uploadPhoto(file)
        const newPhoto = { id: json.id, url: json.url, is_primary: count === 0 }
        setPhotos(p => [...p, newPhoto])
        if (count === 0) setPrimaryPhotoId(json.id)
        count++
        uploaded++
      } catch (err) {
        setError(uploaded > 0 ? `Added ${uploaded}, then: ${err.message}` : err.message)
        break
      }
    }
    setBusy(false)
  }

  async function removePhoto(photoId) {
    setError(""); setBusy(true)
    const res = await authedFetch("/api/happenings-news/photos", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photo_id: photoId }),
    })
    setBusy(false)
    if (!res.ok) { const json = await res.json().catch(() => ({})); setError(json.error || "Could not remove that photo"); return }
    const remaining = photos.filter(p => p.id !== photoId)
    setPhotos(remaining)
    if (primaryPhotoId === photoId) setPrimaryPhotoId(remaining[0]?.id || null)
  }

  async function nominatePrimary(photoId) {
    setPrimaryPhotoId(photoId)
    await authedFetch(`/api/happenings-news/${postId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primary_photo_id: photoId }),
    })
  }

  function finish() {
    onSaved?.(postId)
    onClose()
  }

  return (
    <Portal>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 400,
        display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: "var(--surface)", borderRadius: "16px 16px 0 0", width: "min(480px, 100%)",
          maxHeight: "88vh", overflowY: "auto", padding: "1.25rem 1.25rem 2rem",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.9rem" }}>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--happenings-news)" }}>
              {step === "text" ? "Write a Happenings News post" : "Add photos"}
            </div>
            <button onClick={onClose} style={{ background: "var(--surface2)", border: "none", borderRadius: "50%",
              width: 32, height: 32, cursor: "pointer", fontSize: "1.1rem" }}>✕</button>
          </div>

          {step === "text" ? (
            <>
              <textarea value={content} onChange={e => setContent(e.target.value)} maxLength={MAX_CONTENT_LENGTH}
                rows={8} placeholder="How did the event go? Share the highlights…"
                style={{ width: "100%", padding: "0.75rem", borderRadius: 10, border: "1px solid var(--border)",
                  background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", fontSize: "0.9rem",
                  resize: "vertical", boxSizing: "border-box" }} />
              <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", textAlign: "right", marginTop: 2 }}>{content.length} / {MAX_CONTENT_LENGTH}</div>
              {error && <div style={{ color: "var(--terracotta)", fontSize: "0.82rem", marginTop: 8 }}>{error}</div>}
              <button onClick={createPost} disabled={busy} style={{
                width: "100%", marginTop: "0.9rem", padding: "0.75rem", borderRadius: 12, border: "none",
                background: "var(--happenings-news)", color: "#fff", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit",
              }}>{busy ? "Saving…" : "Continue — add photos →"}</button>
            </>
          ) : (
            <>
              <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", margin: "0 0 0.75rem" }}>
                Up to {MAX_PHOTOS_PER_POST} photos. Tap ★ to choose which one shows as the headline photo on Home and in the feed. Photos are optional — you can finish without any.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: "0.9rem" }}>
                {photos.map(p => (
                  <div key={p.id} style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 8, overflow: "hidden" }}>
                    <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <button onClick={() => nominatePrimary(p.id)} title="Set as headline photo" style={{
                      position: "absolute", top: 4, left: 4, width: 22, height: 22, borderRadius: "50%",
                      border: "none", cursor: "pointer", fontSize: "0.7rem",
                      background: primaryPhotoId === p.id ? "var(--happenings-news)" : "rgba(255,255,255,0.85)",
                      color: primaryPhotoId === p.id ? "#fff" : "var(--text-dim)",
                    }}>★</button>
                    <button onClick={() => removePhoto(p.id)} title="Remove photo" style={{
                      position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%",
                      border: "none", cursor: "pointer", fontSize: "0.7rem", background: "rgba(0,0,0,0.55)", color: "#fff",
                    }}>✕</button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS_PER_POST && (
                  <label style={{
                    aspectRatio: "1 / 1", borderRadius: 8, border: "2px dashed var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                    color: "var(--text-dim)", fontSize: "1.5rem",
                  }}>
                    +
                    <input type="file" accept="image/*" multiple style={{ display: "none" }}
                      onChange={e => { const files = Array.from(e.target.files || []); if (files.length) uploadPhotos(files); e.target.value = "" }} />
                  </label>
                )}
              </div>
              {error && <div style={{ color: "var(--terracotta)", fontSize: "0.82rem", marginBottom: 8 }}>{error}</div>}
              <button onClick={finish} disabled={busy} style={{
                width: "100%", padding: "0.75rem", borderRadius: 12, border: "none",
                background: "var(--happenings-news)", color: "#fff", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit",
              }}>{busy ? "Please wait…" : "Done"}</button>
            </>
          )}
        </div>
      </div>
    </Portal>
  )
}
