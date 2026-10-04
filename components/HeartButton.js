"use client"
import { useEffect, useState } from "react"
import { authedFetch } from "@/lib/getAuthToken"
import { HeartIcon } from "@/components/NavIcons"
import { heartAriaLabel, heartCountText } from "@/lib/happeningsNewsHearts"

// Heart toggle for a Happenings News post (Iain, 2026-10-05). Positive-only
// acknowledgement, no notification. Optimistic: flips straight away, rolls
// back with a message if the server says no.
//
// size "sm" = compact, for the feed row (sits on the poster/date line, no
// extra vertical space). size "lg" = full 44px tap target, for the post
// slide-out. Names of who hearted are NOT shown here -- see HeartNames.
export default function HeartButton({ postId, count = 0, hearted = false, size = "sm", onChange }) {
  const [state, setState] = useState({ count, hearted })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => { setState({ count, hearted }) }, [postId, count, hearted])

  async function toggle(e) {
    e.stopPropagation() // the feed row behind this button opens the post
    if (busy) return
    const next = !state.hearted
    const prev = state
    const optimistic = { hearted: next, count: Math.max(0, state.count + (next ? 1 : -1)) }
    setState(optimistic); setBusy(true); setError("")
    const res = await authedFetch(`/api/happenings-news/${postId}/hearts`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hearted: next }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res?.ok) {
      setState(prev)
      setError(json.error || "Couldn't save your heart. Please try again.")
      return
    }
    const saved = { hearted: json.hearted, count: json.heart_count }
    setState(saved)
    onChange?.(saved)
  }

  const lg = size === "lg"
  const colour = state.hearted ? "var(--happenings-news)" : "var(--text-dim)"
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: lg ? "flex-start" : "flex-end" }}>
      <button type="button" onClick={toggle} aria-pressed={state.hearted}
        aria-label={heartAriaLabel(state.hearted, state.count)} title={state.hearted ? "Remove your heart" : "Heart this post"}
        style={{
          display: "inline-flex", alignItems: "center", gap: lg ? 8 : 4, cursor: "pointer", fontFamily: "inherit",
          minHeight: lg ? 44 : 32, minWidth: lg ? 44 : 32, justifyContent: "center",
          padding: lg ? "0 14px" : "0 6px", borderRadius: 999,
          border: lg ? `1px solid ${state.hearted ? "var(--happenings-news)" : "var(--border)"}` : "none",
          background: lg && state.hearted ? "var(--happenings-news)15" : "transparent",
          color: colour, fontWeight: 700, fontSize: lg ? "0.95rem" : "0.8rem",
        }}>
        <HeartIcon size={lg ? 22 : 18} filled={state.hearted} />
        {lg ? <span>{state.hearted ? "Hearted" : "Heart"}{state.count ? ` · ${state.count}` : ""}</span>
            : heartCountText(state.count) && <span>{heartCountText(state.count)}</span>}
      </button>
      {error && <span role="alert" style={{ fontSize: "0.72rem", color: "var(--terracotta)", marginTop: 2 }}>{error}</span>}
    </span>
  )
}
