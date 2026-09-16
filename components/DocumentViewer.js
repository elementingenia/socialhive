"use client"
//
// Shared in-app document viewer chrome (2026-09-16).
//
// Extracted from app/(app)/committee/attachment/page.js -- the fix for
// Iain's 2026-09-15 report that a Committee attachment had no way to
// close/return to Committee Home on an iOS "Add to Home Screen" PWA (see
// that file's own header comment for the full root-cause writeup: a raw
// target="_blank" link has no real multi-tab support in Safari's
// standalone mode, and an iframe alone loses the browser's native
// zoom/print/save toolset).
//
// This component is the reusable half of that fix -- the toolbar (explicit
// "‹ Close" / "⬇ Download" / "Open in browser ↗" buttons) and the
// scrollable preview area -- so any other in-app document surface can get
// EXACTLY the same behaviour instead of a bespoke approximation. The
// committee attachment page itself now just supplies its own close-target
// (router.back() -> /committee) and colour; this component owns the
// markup/behaviour both places share.
//
// url: the file to display -- a real Storage URL, or an object: URL built
//   from a Blob for content generated on the fly (e.g. a payment
//   reconciliation export -- see app/(app)/documents/view/page.js).
// name: filename shown in the toolbar and used for the Download attribute;
//   also decides image-vs-iframe rendering via its extension.
// accentColor: CSS colour (a var(--token) is fine here -- unlike the
//   generated-PDF HTML itself, this toolbar renders inside the real app
//   page, which has the app's custom properties defined) for the Close
//   button background. Defaults to the app's teal.
// onClose: called when Close is pressed.
export default function DocumentViewer({ url, name, accentColor = "var(--teal)", onClose }) {
  const displayName = name || "Attachment"
  const isImage = /\.(png|jpe?g|gif|webp)$/i.test(displayName)

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
        <button onClick={onClose} style={{ ...btnStyle, background: accentColor, color: "#fff", border: "none" }}>
          ‹ Close
        </button>
        {url && (
          <>
            <a href={url} download={displayName} style={btnStyle}>⬇ Download</a>
            <a href={url} target="_blank" rel="noreferrer" style={btnStyle}>Open in browser ↗</a>
          </>
        )}
        <div style={{
          flex: "1 1 160px", minWidth: 0, fontSize: "0.8rem", color: "var(--text-dim)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right",
        }}>
          📎 {displayName}
        </div>
      </div>
      <div style={{
        height: "calc(100dvh - 130px)", background: "#525659",
        overflow: "auto", WebkitOverflowScrolling: "touch",
      }}>
        {url ? (
          isImage
            ? <img src={url} alt={displayName} style={{ maxWidth: "100%", display: "block", margin: "0 auto" }} />
            : <iframe src={url} title={displayName} style={{ width: "100%", height: "100%", border: "none", minWidth: "100%" }} />
        ) : (
          <div style={{ padding: "2rem", color: "#fff", textAlign: "center" }}>No document specified.</div>
        )}
      </div>
    </div>
  )
}
