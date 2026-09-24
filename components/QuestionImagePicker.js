"use client"
import { useState, useEffect, useRef } from "react"
import { resizeForUpload } from "@/lib/clientImageResize"
import { MAX_IMAGES_PER_MESSAGE, MAX_TOTAL_UPLOAD_BYTES } from "@/lib/questionImageRules"

// Photo attach row for In-App Questions -- used by the Ask sheet
// (components/AskQuestion.js, so Home / Contacts / Owners / Event
// Coordinators all get it) and the reply box on the Questions page.
//
// One row: an "Add photo" pill followed by the chosen thumbnails, each with
// a remove ×. Takes no vertical space beyond that single row, and the pill
// disappears once the limit is reached. Photos are resized in the browser
// the moment they're picked (lib/clientImageResize.js), so any "couldn't
// read that photo" problem shows up straight away, not at Send.
//
// `images` is owned by the parent: [{ id, file, previewUrl }].
export default function QuestionImagePicker({ images, onChange, disabled = false, colour = "var(--teal)" }) {
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState("")
  const inputRef = useRef(null)
  const imagesRef = useRef(images)
  imagesRef.current = images

  // Free the preview object URLs when the picker goes away.
  useEffect(() => () => { imagesRef.current.forEach(i => URL.revokeObjectURL(i.previewUrl)) }, [])

  async function pick(fileList) {
    const files = Array.from(fileList || [])
    if (inputRef.current) inputRef.current.value = ""   // allow re-picking the same photo
    if (!files.length) return
    setError("")
    const room = MAX_IMAGES_PER_MESSAGE - images.length
    const take = files.slice(0, Math.max(0, room))
    setPreparing(true)
    const added = []
    let failure = ""
    for (const f of take) {
      try {
        const file = await resizeForUpload(f)
        added.push({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) })
      } catch (e) {
        failure = e.message
      }
    }
    setPreparing(false)
    const next = [...images, ...added]
    const total = next.reduce((n, i) => n + i.file.size, 0)
    if (total > MAX_TOTAL_UPLOAD_BYTES) {
      added.forEach(i => URL.revokeObjectURL(i.previewUrl))
      setError("Those photos are too large to send together. Try fewer photos.")
      return
    }
    onChange(next)
    if (failure) setError(failure)
    else if (files.length > take.length) setError(`Only ${MAX_IMAGES_PER_MESSAGE} photos can be attached — the first ${take.length || "few"} were added.`)
  }

  function remove(id) {
    const gone = images.find(i => i.id === id)
    if (gone) URL.revokeObjectURL(gone.previewUrl)
    onChange(images.filter(i => i.id !== id))
    setError("")
  }

  const full = images.length >= MAX_IMAGES_PER_MESSAGE
  const busy = disabled || preparing

  return (
    <div style={{ marginTop: "0.6rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        {!full && (
          <label style={{
            display: "inline-flex", alignItems: "center", gap: "0.35rem", height: 56, padding: "0 0.9rem",
            borderRadius: 10, border: `1.5px dashed ${colour}`, color: colour, background: "var(--surface)",
            fontWeight: 700, fontSize: "0.82rem", cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.6 : 1, fontFamily: "inherit", boxSizing: "border-box",
          }}>
            <span aria-hidden>📷</span>
            {preparing ? "Preparing…" : images.length ? "Add another" : `Add photos (up to ${MAX_IMAGES_PER_MESSAGE})`}
            <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
              disabled={busy} onChange={e => pick(e.target.files)} />
          </label>
        )}
        {images.map(img => (
          <div key={img.id} style={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}>
            <img src={img.previewUrl} alt="Attached photo"
              style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)", display: "block" }} />
            <button type="button" onClick={() => remove(img.id)} disabled={disabled} aria-label="Remove photo"
              style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%",
                border: "none", background: "var(--text)", color: "var(--surface)", fontSize: "0.8rem", lineHeight: "22px",
                padding: 0, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 700 }}>×</button>
          </div>
        ))}
      </div>
      {error && <div style={{ color: "#b91c1c", fontSize: "0.8rem", marginTop: "0.4rem" }}>{error}</div>}
    </div>
  )
}

// Builds the fetch options for a question/reply send. Plain JSON when there
// are no photos (identical to the pre-photos request), multipart otherwise.
export function messageRequestInit(fields, images) {
  if (!images?.length) {
    return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) }
  }
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) fd.append(k, String(v))
  for (const img of images) fd.append("images", img.file, img.file.name || "photo.jpg")
  return { method: "POST", body: fd }
}

// Error text for a failed send -- a 413 from the platform isn't JSON.
export async function sendErrorMessage(res, fallback) {
  if (res.status === 413) return "Those photos are too large to send together. Try fewer photos."
  const d = await res.json().catch(() => ({}))
  return d.error || fallback
}
