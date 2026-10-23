"use client"
// lib/useHiveFunds.js
//
// One fetch of /api/hive-funds per page, shared by every component that
// needs it (the Social home tile, each event card's Finances panel, the
// funds page). Without the shared cache every event card would fire its own
// request. refreshHiveFunds() re-fetches and updates every subscriber.

import { useEffect, useState } from "react"
import { authedFetch } from "@/lib/getAuthToken"

const cache = {}   // fund -> { data, promise, subs:Set }

function entry(fund) {
  return (cache[fund] ||= { data: null, promise: null, subs: new Set() })
}

async function load(fund) {
  const e = entry(fund)
  e.inflight = true
  e.promise = (async () => {
    try {
      const res = await authedFetch(`/api/hive-funds?fund=${encodeURIComponent(fund)}`, { cache: "no-store" })
      const d = await res.json().catch(() => ({}))
      e.data = res.ok ? d : { visible: false, error: d.error || "Couldn't load Hive Funds" }
    } catch {
      e.data = { visible: false, error: "Couldn't load Hive Funds" }
    }
    e.at = Date.now()
    e.inflight = false
    e.subs.forEach(fn => fn(e.data))
    return e.data
  })()
  return e.promise
}

export function refreshHiveFunds(fund = "social") {
  return load(fund)
}

export function useHiveFunds(fund = "social") {
  const e = entry(fund)
  const [data, setData] = useState(e.data)
  useEffect(() => {
    const ent = entry(fund)
    ent.subs.add(setData)
    if (ent.data) setData(ent.data)
    // Re-fetch on a fresh mount if what we hold is over 30s old (the cache
    // outlives page navigation in the app shell).
    if (!ent.inflight && (!ent.at || Date.now() - ent.at > 30000)) load(fund)
    return () => { ent.subs.delete(setData) }
  }, [fund])
  return { data, loading: !data, refresh: () => load(fund) }
}

// POST an action and refresh everyone on success.
export async function hiveFundsAction(body, fund = "social") {
  const res = await authedFetch("/api/hive-funds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fund, ...body }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || "Something went wrong")
  await load(fund)
  return d
}
