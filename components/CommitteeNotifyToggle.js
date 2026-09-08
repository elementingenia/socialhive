"use client"
import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"

// Committee's notification opt-out (decision 3, Social_Hive_Committee_
// Notice_Board_Scope_v3_FINAL / supabase/migrations/097_committee_hub.sql).
// Deliberately the INVERSE polarity of FollowHubButton/hub_followers: every
// resident is subscribed by default (absence from
// committee_notification_optouts), and this toggle lets them opt OUT.
// Pill wording per Iain's locked decision: shows "Opt out" while
// subscribed; tapping it opts out and the pill becomes "Join" (tapping
// that again removes the opt-out row and reverts to "Opt out").
export default function CommitteeNotifyToggle({ colour = "var(--committee)" }) {
  const { member } = useUser()
  const [optedOut, setOptedOut] = useState(null) // null = loading
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!member?.id) { setOptedOut(false); return }
    supabase.from("committee_notification_optouts").select("member_id")
      .eq("member_id", member.id).maybeSingle()
      .then(({ data }) => setOptedOut(!!data))
  }, [member?.id])

  async function toggle() {
    if (!member?.id || busy) return
    setBusy(true)
    if (optedOut) {
      await supabase.from("committee_notification_optouts").delete().eq("member_id", member.id)
      setOptedOut(false)
    } else {
      await supabase.from("committee_notification_optouts").insert({ member_id: member.id })
      setOptedOut(true)
    }
    setBusy(false)
  }

  if (optedOut === null) return null
  return (
    <button onClick={toggle} disabled={busy}
      title={optedOut ? "Tap to start getting Committee update notifications again" : "Tap to stop getting Committee update notifications"}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0.35rem 0.9rem",
        borderRadius: 20, fontFamily: "inherit", fontWeight: 700, fontSize: "0.82rem",
        cursor: busy ? "wait" : "pointer", whiteSpace: "nowrap",
        border: `1.5px solid ${colour}`, background: optedOut ? "var(--surface)" : colour,
        color: optedOut ? colour : "#fff" }}>
      {optedOut ? "Join" : "Opt out"}
    </button>
  )
}
