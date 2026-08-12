"use client"
import Link from "next/link"

// Small "⚙ Manage" pill, shared by every hub's own page to reach its Owner
// self-service screen (Owner_SelfService_and_Library_Hub_Scope_v1, Part
// A.3). Callers gate visibility on admin-or-this-area's-Owner themselves —
// this component is just the consistent chrome.
export default function ManageLink({ href, label, colour = "var(--teal)" }) {
  return (
    <Link href={href}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0.4rem 0.9rem",
        borderRadius: 20, border: `1px dashed ${colour}`, background: "transparent",
        color: colour, fontWeight: 700, fontFamily: "inherit", fontSize: "0.82rem",
        textDecoration: "none", marginBottom: 12 }}>
      ⚙ {label}
    </Link>
  )
}
