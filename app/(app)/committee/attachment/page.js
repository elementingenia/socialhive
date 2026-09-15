"use client"
import { Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"

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
// First fix (route through an in-app iframe instead of a raw cross-origin
// link) solved the "no way back" problem structurally but created two new
// ones -- confirmed via Iain's own screenshot, not theorised: an iframe'd
// PDF loses the browser's native PDF chrome entirely (no zoom, no
// fit-to-width, no print/save icon anywhere), and the fixed 75vh box
// rendered the page at its native width with no way to shrink it to fit --
// the screenshot shows the minutes cut off mid-line on the right edge with
// no visible way to zoom out or scroll sideways. Also, this viewer's only
// "way back" was the small 30px Element Happenings logo shared by every
// page's Header -- not an obvious, dedicated close control for a document
// the resident just opened, which is why it still didn't read as "closed"
// to Iain even though it technically worked.
//
// Fix: this page now owns its own toolbar, independent of the shared
// Header -- an explicit "‹ Close" button (always first, largest touch
// target, goes back to wherever the attachment was opened from) plus
// "Download" (forces a real save via the anchor `download` attribute,
// same outcome the old native-viewer save icon gave) and "Open in
// browser" (a plain target="_blank" link to the raw file -- deliberately
// reintroduces the ORIGINAL pre-fix behaviour as an opt-in escape hatch,
// so anyone who wants the full native zoom/print/save toolset can still
// get it, without it being the forced default that stranded people). The
// preview area itself now fills the real available viewport height
// (dvh-based, accounting for the toolbar/BottomNav) instead of a fixed
// 75vh guess, and is a horizontally + vertically scrollable box so a wide
// page can be panned rather than silently clipped off-screen.
function AttachmentViewerInner() {
  const params = useSearchParams()
  const router = useRouter()
  const url = params.get("url") || ""
  const name = params.get("name") || "Attachment"
  const isImage = /\.(png|jpe?g|gif|webp)$/i.test(name)

  function close() {
    // router.back() when this viewer was reached via in-app navigation
    // (the normal case); Committee Home as a safe fallback if this page
    // was opened directly (e.g. a bookmarked/shared link) and there's no
    // history to go back to.
    if (typeof window !== "undefined" && window.history.length > 1) router.back()
    else router.push("/committee")
  }

  const btnStyle = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "0.5rem 0.85rem",
    borderRadius: 8, fontSize: "0.85rem", fontWeight: 700, cursor: "pointer",
    textDecoration: "none", whiteSpace: "nowrap", border: "1px solid var(--border)",
    background: "var(--surface)", color: "var(--text)",
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "0 0 6rem" }}>
      {/* Dedicated toolbar -- deliberately separate from the shared Header's
          small logo, per Iain's feedback that the logo alone didn't read as
          a way to close this. */}
      <div style={{
        position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center",
        gap: 8, flexWrap: "wrap", padding: "0.6rem 1rem", borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
      }}>
        <button onClick={close} style={{ ...btnStyle, background: "var(--committee)", color: "#fff", border: "none" }}>
          ‹ Close
        </button>
        {url && (
          <>
            <a href={url} download={name} style={btnStyle}>⬇ Download</a>
            <a href={url} target="_blank" rel="noreferrer" style={btnStyle}>Open in browser ↗</a>
          </>
        )}
        <div style={{
          flex: "1 1 160px", minWidth: 0, fontSize: "0.8rem", color: "var(--text-dim)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right",
        }}>
          📎 {name}
        </div>
      </div>
      <div style={{
        height: "calc(100dvh - 130px)", background: "#525659",
        overflow: "auto", WebkitOverflowScrolling: "touch",
      }}>
        {url ? (
          isImage
            ? <img src={url} alt={name} style={{ maxWidth: "100%", display: "block", margin: "0 auto" }} />
            : <iframe src={url} title={name} style={{ width: "100%", height: "100%", border: "none", minWidth: "100%" }} />
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
