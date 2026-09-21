"use client"
import { useEffect, useState } from "react"
import { isEventPast } from "@/lib/date"
import HappeningsNewsComposer from "@/components/HappeningsNewsComposer"
import PostSlideOut from "@/components/PostSlideOut"

// EC's entry point for adding a Happenings News post -- lives inside
// EventSlideOut's CoordinatorPanel (Iain, 2026-09-21: "the coordinator of
// any event will be able to add to their event, after it has ended").
// Renders nothing until the event has actually ended (lib/date.js's
// isEventPast, the same "event date/time has passed" definition the server
// enforces in lib/happeningsNewsAuth.js) -- CoordinatorPanel already gates
// this whole panel to admin/Owner/EC, so no separate permission check is
// needed here, only the event-ended check. A tiny, self-contained addition
// to EventSlideOut.js rather than surgery on that 2900-line file: one
// import, one JSX line.
export default function HappeningsNewsCard({ event, colour }) {
  const [postId, setPostId] = useState(undefined) // undefined = loading, null = none yet
  const [composerOpen, setComposerOpen] = useState(false)
  const [viewingPostId, setViewingPostId] = useState(null)

  useEffect(() => {
    if (!event?.id || !isEventPast(event)) { setPostId(null); return }
    let cancelled = false
    fetch(`/api/happenings-news?limit=200`).then(r => r.json()).then(json => {
      if (cancelled) return
      const existing = (json.posts || []).find(p => p.event_id === event.id)
      setPostId(existing?.id || null)
    }).catch(() => { if (!cancelled) setPostId(null) })
    return () => { cancelled = true }
  }, [event?.id])

  async function recheck() {
    const json = await fetch(`/api/happenings-news?limit=200`).then(r => r.json()).catch(() => ({}))
    const existing = (json.posts || []).find(p => p.event_id === event.id)
    setPostId(existing?.id || null)
  }

  if (!event?.id || !isEventPast(event) || postId === undefined) return null

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        Happenings News
      </div>
      {postId ? (
        <button onClick={() => setViewingPostId(postId)} style={{
          width: "100%", textAlign: "left", padding: "0.7rem 0.85rem", borderRadius: 10,
          border: "1px solid var(--happenings-news)", background: "var(--happenings-news)10",
          color: "var(--happenings-news)", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit",
        }}>📰 View / edit your recap</button>
      ) : (
        <button onClick={() => setComposerOpen(true)} style={{
          width: "100%", textAlign: "left", padding: "0.7rem 0.85rem", borderRadius: 10,
          border: "1px dashed var(--happenings-news)", background: "transparent",
          color: "var(--happenings-news)", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit",
        }}>📰 Write a Happenings News post about this event</button>
      )}

      {composerOpen && (
        <HappeningsNewsComposer eventId={event.id} onClose={() => setComposerOpen(false)}
          onSaved={(newPostId) => { setComposerOpen(false); setPostId(newPostId) }} />
      )}
      {viewingPostId && (
        <PostSlideOut postId={viewingPostId} onClose={() => setViewingPostId(null)} onChanged={recheck} />
      )}
    </div>
  )
}
