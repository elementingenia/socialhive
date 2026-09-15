"use client"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"

// BUG (2026-09-15, Iain): "when Export is engaged on the Committee PDF
// attached to an update, there is no way to close the document and return
// to the Committee Home page." Root cause: PostCard's attachment link
// (app/(app)/committee/page.js) opened post.attachment_url directly via
// <a target="_blank"> -- a raw, cross-origin (Supabase Storage) file URL.
// On a desktop browser that's a normal closeable tab, but on an iOS
// "Add to Home Screen" installed PWA (this app's own recommended install
// path for residents), Safari's standalone mode has no real multi-tab
// support: target="_blank" navigates the SAME standalone window straight
// to the raw PDF/image with none of this app's own chrome (no Header, no
// BottomNav), leaving only the OS back-swipe gesture to escape -- which an
// aging, less tech-comfortable resident is unlikely to know or try. Same
// root cause class as BUG-038 (User Guide had no way back), but that fix
// (a link inside the page itself) doesn't apply here since the file is an
// external, uncontrollable document, not an app page.
//
// Fix: route PDF/image attachments through this in-app viewer instead of a
// raw cross-origin link, so the file renders INSIDE this app's own
// same-origin page -- which means it inherits the (app) layout's Header
// (back-to-Home logo) and BottomNav (Committee/Documents tabs) for free,
// giving a real, always-visible way back. Word documents (.doc/.docx)
// still use a plain target="_blank" link in PostCard, since those trigger
// a genuine download/share-sheet rather than an in-webview render, and so
// don't exhibit this failure mode.
function AttachmentViewerInner() {
  const params = useSearchParams()
  const url = params.get("url") || ""
  const name = params.get("name") || "Attachment"
  const isImage = /\.(png|jpe?g|gif|webp)$/i.test(name)

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "0 0 6rem" }}>
      <div style={{
        padding: "0.6rem 1rem", borderBottom: "1px solid var(--border)",
        background: "var(--surface)", fontSize: "0.85rem", color: "var(--text-dim)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        📎 {name}
      </div>
      <div style={{ height: "75vh", background: "#525659" }}>
        {url ? (
          isImage
            ? <img src={url} alt={name} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
            : <iframe src={url} title={name} style={{ width: "100%", height: "100%", border: "none" }} />
        ) : (
          <div style={{ padding: "2rem", color: "#fff", textAlign: "center" }}>No attachment specified.</div>
        )}
      </div>
    </div>
  )
}

export default function AttachmentViewerPage() {
  return (
    <Suspense fallback={null}>
      <AttachmentViewerInner />
    </Suspense>
  )
}
