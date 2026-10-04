"use client"
import { useEffect, useRef, useState } from "react"

// Renders a PDF as a column of pages that each fit the screen width
// (Iain, 2026-10-04). DocumentViewer used to put PDFs in an <iframe>, which
// on a phone (iPhone Safari especially) shows the page at full A4 size --
// wider than the screen, often only the first page -- so it didn't "fit on
// the screen properly". pdf.js draws each page onto a canvas sized to the
// container instead; the normal pinch-zoom still works on top of that.
//
// pdfjs-dist is pinned to v3 (legacy build): v4+ needs browser features
// (Promise.withResolvers) that older iPhones still in use here don't have.
// It's loaded only when a PDF is actually opened, so it adds nothing to any
// other page. If anything fails (old browser, network), onError lets the
// caller fall back to the plain iframe so the document still opens.
export default function PdfPages({ url, onError }) {
  const holder = useRef(null)
  const [status, setStatus] = useState("loading") // loading | ready | error
  const [pages, setPages] = useState(0)

  useEffect(() => {
    let cancelled = false
    let doc = null
    async function run() {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf")
        pdfjs.GlobalWorkerOptions.workerPort = new Worker(
          new URL("pdfjs-dist/legacy/build/pdf.worker.min.js", import.meta.url))
        doc = await pdfjs.getDocument({ url }).promise
        if (cancelled) return
        setPages(doc.numPages)
        const box = holder.current
        if (!box) return
        box.innerHTML = ""
        const width = Math.max(240, box.clientWidth - 16)
        const ratio = Math.min(window.devicePixelRatio || 1, 2.5)
        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled) return
          const page = await doc.getPage(n)
          const base = page.getViewport({ scale: 1 })
          const scale = width / base.width
          const vp = page.getViewport({ scale: scale * ratio })
          const canvas = document.createElement("canvas")
          canvas.width = Math.floor(vp.width)
          canvas.height = Math.floor(vp.height)
          canvas.style.width = `${Math.floor(base.width * scale)}px`
          canvas.style.height = `${Math.floor(base.height * scale)}px`
          canvas.style.display = "block"
          canvas.style.margin = "0 auto 8px"
          canvas.style.background = "#fff"
          canvas.style.boxShadow = "0 1px 4px rgba(0,0,0,.35)"
          canvas.setAttribute("aria-label", `Page ${n} of ${doc.numPages}`)
          box.appendChild(canvas)
          await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise
          if (n === 1 && !cancelled) setStatus("ready")
        }
      } catch (err) {
        if (!cancelled) { setStatus("error"); onError?.(err) }
      }
    }
    run()
    return () => { cancelled = true; try { doc?.destroy() } catch { /* noop */ } }
  }, [url, onError])

  return (
    <div style={{ padding: "8px 8px 2rem" }}>
      {status === "loading" && (
        <div style={{ color: "#fff", textAlign: "center", padding: "2rem 1rem", fontSize: "0.95rem" }}>
          Opening document…
        </div>
      )}
      <div ref={holder} aria-label={pages ? `Document, ${pages} page${pages === 1 ? "" : "s"}` : undefined} />
    </div>
  )
}
