"use client"
import { Suspense, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import DocumentViewer from "@/components/DocumentViewer"

// Generic in-app document viewer (2026-09-16).
//
// Iain, reviewing the Payment Reconciliation PDF export (lib/attendeeExport.js's
// exportPaymentReconciliationPdf): "The same design functions need to be
// applied to the reconciliation export ... Close/Download/Open in Browser
// options etc in EXACTLY the same functions and design as implemented for
// the committee update document reading." The reconciliation export used
// to open a bare window.open("", "_blank") popup with nothing but a
// "Print / Save as PDF" button -- the exact same "no way back" shape
// app/(app)/committee/attachment/page.js was built to fix for Committee
// attachments (see that file's header comment for the full root-cause
// writeup, and the risk on an iOS "Add to Home Screen" PWA specifically),
// plus it was a real `window.open` popup, so it was ALSO subject to the
// same "check your pop-up blocker" failure mode that page's fix avoided
// by using in-app client-side navigation instead of a new window/tab.
//
// This route is the Committee page's counterpart for content that isn't a
// pre-existing Storage file -- generated HTML built entirely client-side
// (a reconciliation report). The caller builds the report HTML, wraps it
// in a Blob, and passes the resulting object: URL here via `url` -- the
// blob stays valid because this is a same-document, client-side route
// change (no full page reload), exactly like Committee's own url param.
// `name` drives the toolbar filename + Download attribute; `color`
// (a literal hex, since it only needs to survive a URL param, not resolve
// a CSS custom property) tints the Close button to match whichever hub/
// club the export came from, same as Committee's own var(--committee).
function DocumentViewerInner() {
  const params = useSearchParams()
  const router = useRouter()
  const url = params.get("url") || ""
  const name = params.get("name") || "Document"
  const color = params.get("color") || "var(--teal)"

  function close() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back()
    else router.push("/home")
  }

  // Blob object: URLs are only good for the lifetime of the document that
  // created them -- revoke this one when the viewer unmounts (Close,
  // navigating away, or closing the tab) so it isn't left leaking memory.
  useEffect(() => {
    return () => {
      if (url && url.startsWith("blob:")) {
        try { URL.revokeObjectURL(url) } catch (e) { /* noop */ }
      }
    }
  }, [url])

  return <DocumentViewer url={url} name={name} accentColor={color} onClose={close} />
}

export default function DocumentViewerPage() {
  return (
    <Suspense fallback={null}>
      <DocumentViewerInner />
    </Suspense>
  )
}
