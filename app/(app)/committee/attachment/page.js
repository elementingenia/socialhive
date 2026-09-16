"use client"
import { Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import DocumentViewer from "@/components/DocumentViewer"

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
//
// 2026-09-16: the toolbar/preview markup itself was extracted into
// components/DocumentViewer.js so the identical Close/Download/Open-in-
// browser behaviour could be reused for the payment reconciliation export
// (app/(app)/documents/view/page.js) without a second, drifting copy --
// this page now only owns the Committee-specific bits (the close target,
// the committee accent colour).
function AttachmentViewerInner() {
  const params = useSearchParams()
  const router = useRouter()
  const url = params.get("url") || ""
  const name = params.get("name") || "Attachment"

  function close() {
    // router.back() when this viewer was reached via in-app navigation
    // (the normal case); Committee Home as a safe fallback if this page
    // was opened directly (e.g. a bookmarked/shared link) and there's no
    // history to go back to.
    if (typeof window !== "undefined" && window.history.length > 1) router.back()
    else router.push("/committee")
  }

  return <DocumentViewer url={url} name={name} accentColor="var(--committee)" onClose={close} />
}

export default function AttachmentViewerPage() {
  return (
    <Suspense fallback={null}>
      <AttachmentViewerInner />
    </Suspense>
  )
}
