"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { authedFetch } from "@/lib/getAuthToken"
import { useUser } from "@/lib/UserContext"
import FollowHubButton from "@/components/FollowHubButton"
import ManageLink from "@/components/ManageLink"
import { ListingCard, ListingSheet, ListingForm, inputStyle, primaryButton, SWAP } from "@/components/SwapUI"
import { CATEGORIES, TYPE_LABELS, PAYMENT_FOOTER, filterListings, capReached } from "@/lib/swap"

// Swap & Sell -- Browse (Element_Happenings_Swap_and_Sell_Scope_Answered,
// Iain 2026-10-05). Discreet by design: nothing here is broadcast; Join is
// the only way to hear about new listings.
const FILTERS = ["all", "sale", "free", "wanted"]

export default function SwapBrowsePage() {
  const router = useRouter()
  const { isAdmin } = useUser()
  const [data, setData] = useState(null) // null = loading
  const [loadError, setLoadError] = useState("")
  const [type, setType] = useState("all")
  const [category, setCategory] = useState("all")
  const [catOpen, setCatOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoadError("")
    const res = await authedFetch("/api/swap").catch(() => null)
    const json = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) { setLoadError(json.error || "Couldn't load Swap & Sell."); setData({ listings: [], me: null }); return }
    setData(json)
  }, [])
  useEffect(() => { load() }, [load])

  // ?listing=<id> opens that listing (e.g. from a shared link).
  useEffect(() => {
    if (!data?.listings) return
    const id = new URLSearchParams(window.location.search).get("listing")
    if (id) setOpen(data.listings.find(l => l.id === id) || null)
  }, [data])

  const shown = useMemo(() => filterListings(data?.listings, { type, category, query }), [data, type, category, query])
  const me = data?.me
  const atCap = me ? capReached(me.activeCount, me.cap) : false

  return (
    <div style={{ padding: "1rem 1rem 6rem", maxWidth: 680, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <FollowHubButton hubType="swap" colour={SWAP} label="Join" />
        {isAdmin && <ManageLink href="/swap/manage" label="Manage" colour={SWAP} />}
      </div>
      <p style={{ fontSize: "0.85rem", color: "var(--text-dim)", margin: "0 0 0.9rem" }}>
        Join to be told when something new is listed. Otherwise Swap & Sell stays quiet.
      </p>

      {me && !me.live && isAdmin && (
        <div style={{ background: "var(--amber-light)", borderRadius: 10, padding: "0.6rem 0.8rem", fontSize: "0.85rem", marginBottom: "0.9rem" }}>
          Hidden from residents in this deployment — admins can try it out. Turn it on in Manage.
        </div>
      )}

      {me && (me.blocked ? (
        <div style={{ fontSize: "0.88rem", color: "var(--text-dim)", marginBottom: "0.9rem" }}>An admin has paused your listings in Swap & Sell.</div>
      ) : atCap ? (
        <div style={{ fontSize: "0.88rem", color: "var(--text-dim)", marginBottom: "0.9rem" }}>
          You have {me.activeCount} active listing{me.activeCount === 1 ? "" : "s"} — the most allowed at once. Mark one as Gone in{" "}
          <button type="button" onClick={() => router.push("/swap/mine")} style={{ background: "none", border: "none", padding: 0, color: SWAP, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", textDecoration: "underline" }}>My Listings</button> to add another.
        </div>
      ) : (
        <button type="button" onClick={() => setCreating(true)} style={{ ...primaryButton(false), marginBottom: "1rem" }}>+ List something</button>
      ))}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "0.6rem" }}>
        {FILTERS.map(f => {
          const active = type === f
          return (
            <button key={f} type="button" onClick={() => setType(f)} aria-pressed={active} style={{
              padding: "0.45rem 0.9rem", borderRadius: 999, fontFamily: "inherit", fontSize: "0.88rem", fontWeight: 700, cursor: "pointer",
              border: `1px solid ${active ? SWAP : "var(--border)"}`, background: active ? SWAP : "var(--surface)",
              color: active ? "#fff" : "var(--text-dim)",
            }}>{f === "all" ? "All" : TYPE_LABELS[f]}</button>
          )
        })}
        <button type="button" onClick={() => setCatOpen(o => !o)} aria-expanded={catOpen} style={{
          padding: "0.45rem 0.9rem", borderRadius: 999, fontFamily: "inherit", fontSize: "0.88rem", fontWeight: 700, cursor: "pointer",
          border: `1px solid ${category !== "all" ? SWAP : "var(--border)"}`, background: category !== "all" ? SWAP : "var(--surface)",
          color: category !== "all" ? "#fff" : "var(--text-dim)",
        }}>{category === "all" ? "Category" : category} {catOpen ? "▲" : "▼"}</button>
      </div>
      {catOpen && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: "0.6rem" }}>
          {["all", ...CATEGORIES].map(c => (
            <button key={c} type="button" onClick={() => { setCategory(c); setCatOpen(false) }} style={{
              display: "block", width: "100%", textAlign: "left", padding: "0.6rem 1rem", border: "none",
              borderBottom: "1px solid var(--border)", background: c === category ? "var(--surface2)" : "var(--surface)",
              color: "var(--text)", fontFamily: "inherit", fontSize: "0.92rem", cursor: "pointer", fontWeight: c === category ? 700 : 400,
            }}>{c === "all" ? "All categories" : c}</button>
          ))}
        </div>
      )}
      <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search listings"
        aria-label="Search listings" style={{ ...inputStyle, marginBottom: "1rem" }} />

      {data === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}><div className="spinner" /></div>
      ) : loadError ? (
        <div role="alert" style={{ color: "var(--danger)", fontSize: "0.9rem" }}>{loadError}</div>
      ) : shown.length === 0 ? (
        <div style={{ color: "var(--text-dim)", fontSize: "0.92rem", padding: "1rem 0" }}>
          {data.listings.length === 0 ? "Nothing listed yet." : "Nothing matches — try another filter."}
        </div>
      ) : (
        shown.map(l => <ListingCard key={l.id} listing={l} onOpen={() => setOpen(l)} />)
      )}

      <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", textAlign: "center", marginTop: "1.5rem" }}>{PAYMENT_FOOTER}</div>

      {open && <ListingSheet listing={open} me={me} onClose={() => setOpen(null)} onChanged={load} />}
      {creating && <ListingForm me={me} onClose={() => { setCreating(false); load() }} onSaved={load} />}
    </div>
  )
}
