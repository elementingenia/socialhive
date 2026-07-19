"use client"
import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"

// Opt-in "Follow this hub" toggle (Iain 2026-07-18). Following a fixed hub
// (Movies now) gets you notified when a new event is added there — the same
// idea as joining a club. Writes hub_followers via the member's own RLS.
export default function FollowHubButton({ hubType, colour = "var(--teal)", label = "Follow" }) {
  const { member } = useUser()
  const [following, setFollowing] = useState(null) // null = loading
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!member?.id) { setFollowing(false); return }
    supabase.from("hub_followers").select("member_id")
      .eq("hub_type", hubType).eq("member_id", member.id).maybeSingle()
      .then(({ data }) => setFollowing(!!data))
  }, [hubType, member?.id])

  async function toggle() {
    if (!member?.id || busy) return
    setBusy(true)
    if (following) {
      await supabase.from("hub_followers").delete().eq("hub_type", hubType).eq("member_id", member.id)
      setFollowing(false)
    } else {
      await supabase.from("hub_followers").insert({ hub_type: hubType, member_id: member.id })
      setFollowing(true)
    }
    setBusy(false)
  }

  if (following === null) return null
  return (
    <button onClick={toggle} disabled={busy}
      title={following ? "You'll stop getting alerts about new events here" : "Get notified when a new event is added here"}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0.35rem 0.9rem",
        borderRadius: 20, fontFamily: "inherit", fontWeight: 700, fontSize: "0.82rem",
        cursor: busy ? "wait" : "pointer", whiteSpace: "nowrap",
        border: `1.5px solid ${colour}`, background: following ? "var(--surface)" : colour,
        color: following ? colour : "#fff" }}>
      {following ? `✓ Following` : `+ ${label}`}
    </button>
  )
}
