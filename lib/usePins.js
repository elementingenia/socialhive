"use client"
// The signed-in resident's own My Stuff pins (migration 136). Loads once per
// page; toggle() updates the screen straight away and rolls back if the save
// fails. Private: /api/my-stuff only ever returns the caller's own pins.
import { useCallback, useEffect, useState } from "react"
import { authedFetch } from "@/lib/getAuthToken"

const keyOf = (type, id) => `${type}:${id}`

export function usePins() {
  const [pins, setPins] = useState(() => new Set())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    authedFetch("/api/my-stuff").then(r => r.ok ? r.json() : null).then(d => {
      if (cancelled || !d) return
      setPins(new Set((d.pins || []).map(p => keyOf(p.item_type, p.item_id))))
      setReady(true)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const isPinned = useCallback((type, id) => pins.has(keyOf(type, id)), [pins])

  const toggle = useCallback(async (type, id) => {
    const k = keyOf(type, id)
    const willPin = !pins.has(k)
    const apply = (on) => setPins(prev => { const n = new Set(prev); on ? n.add(k) : n.delete(k); return n })
    apply(willPin)
    const res = await authedFetch("/api/my-stuff", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: willPin ? "pin" : "unpin", item_type: type, item_id: id }),
    }).catch(() => null)
    if (!res?.ok) { apply(!willPin); return false }
    return true
  }, [pins])

  return { ready, isPinned, toggle }
}
