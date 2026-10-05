"use client"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { authedFetch } from "@/lib/getAuthToken"
import { ListingCard, ListingForm, primaryButton, SWAP } from "@/components/SwapUI"
import { isListingActive, isExpired, statusLabel, capReached } from "@/lib/swap"

// Swap & Sell -- My Listings. Status is changed HERE (Scope_Answered 3.3,
// answering Iain's "what if there's no conversation?"): a deal done at the
// letterbox is closed off with one tap, no conversation needed.
const STATUS_BUTTONS = ["available", "reserved", "gone"]

export default function SwapMinePage() {
  const router = useRouter()
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState("")
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [rowError, setRowError] = useState({})

  const load = useCallback(async () => {
    setLoadError("")
    const res = await authedFetch("/api/swap?mine=1").catch(() => null)
    const json = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) { setLoadError(json.error || "Couldn't load your listings."); setData({ listings: [], me: null }); return }
    setData(json)
  }, [])
  useEffect(() => { load() }, [load])

  async function patch(listing, body) {
    setBusyId(listing.id); setRowError(e => ({ ...e, [listing.id]: "" }))
    const res = await authedFetch(`/api/swap/${listing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => ({})) : {}
    setBusyId(null)
    if (!res?.ok) { setRowError(e => ({ ...e, [listing.id]: json.error || "Couldn't save — please try again." })); return }
    load()
  }

  const me = data?.me
  const listings = data?.listings || []
  const atCap = me ? capReached(me.activeCount, me.cap) : false

  return (
    <div style={{ padding: "1rem 1rem 6rem", maxWidth: 680, margin: "0 auto" }}>
      {me && (
        <div style={{ fontSize: "0.88rem", color: "var(--text-dim)", marginBottom: "0.75rem" }}>
          {me.activeCount} of {me.cap} active listing{me.cap === 1 ? "" : "s"}. Listings come down after 30 days unless you keep them listed.
        </div>
      )}
      {me && !me.blocked && !atCap && (
        <button type="button" onClick={() => setCreating(true)} style={{ ...primaryButton(false), marginBottom: "1rem" }}>+ List something</button>
      )}
      {me?.blocked && <div style={{ fontSize: "0.88rem", color: "var(--text-dim)", marginBottom: "1rem" }}>An admin has paused your listings in Swap & Sell.</div>}

      {data === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}><div className="spinner" /></div>
      ) : loadError ? (
        <div role="alert" style={{ color: "var(--danger)", fontSize: "0.9rem" }}>{loadError}</div>
      ) : listings.length === 0 ? (
        <div style={{ color: "var(--text-dim)", fontSize: "0.92rem" }}>You haven&apos;t listed anything yet.</div>
      ) : listings.map(l => {
        const hidden = !!l.hidden_at
        const expired = !hidden && l.status !== "gone" && isExpired(l)
        const active = isListingActive(l)
        const daysLeft = active ? Math.max(0, Math.ceil((new Date(l.expires_at) - Date.now()) / 86400000)) : 0
        return (
          <ListingCard key={l.id} listing={{ ...l, seller_name: "" }} onOpen={() => !hidden && setEditing(l)}>
            <div style={{ padding: "0 0.75rem 0.75rem" }}>
              {hidden ? (
                <div style={{ fontSize: "0.85rem", color: "var(--danger)" }}>An admin has taken this listing down.</div>
              ) : (
                <>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: 6 }}>
                    {expired ? "Expired — no longer showing." : l.status === "gone" ? "No longer showing." : `Showing for ${daysLeft} more day${daysLeft === 1 ? "" : "s"}.`}
                    {l.enquiry_count ? ` ${l.enquiry_count} ${l.enquiry_count === 1 ? "person has" : "people have"} messaged you.` : ""}
                  </div>
                  <div role="group" aria-label="Status" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {STATUS_BUTTONS.map(s => {
                      const current = l.status === s
                      return (
                        <button key={s} type="button" disabled={busyId === l.id || current}
                          onClick={() => patch(l, { status: s })} aria-pressed={current}
                          style={{
                            flex: "1 1 0", minWidth: 90, padding: "0.6rem 0.4rem", borderRadius: 10, fontFamily: "inherit",
                            fontSize: "0.88rem", fontWeight: 700, cursor: current ? "default" : "pointer",
                            border: `1px solid ${current ? SWAP : "var(--border)"}`,
                            background: current ? SWAP : "var(--surface)", color: current ? "#fff" : "var(--text)",
                          }}>{statusLabel(l.type, s)}</button>
                      )
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    {l.status !== "gone" && (expired || daysLeft <= 7) && (
                      <button type="button" disabled={busyId === l.id} onClick={() => patch(l, { keep_listed: true })} style={{
                        padding: "0.55rem 1rem", borderRadius: 10, border: `1px solid ${SWAP}`, background: "var(--surface)",
                        color: SWAP, fontWeight: 700, fontFamily: "inherit", fontSize: "0.88rem", cursor: "pointer",
                      }}>Keep it listed</button>
                    )}
                    <button type="button" onClick={() => setEditing(l)} style={{
                      padding: "0.55rem 1rem", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)",
                      color: "var(--text)", fontWeight: 700, fontFamily: "inherit", fontSize: "0.88rem", cursor: "pointer",
                    }}>Edit / photos</button>
                    {l.enquiry_count > 0 && (
                      <button type="button" onClick={() => router.push("/swap/messages")} style={{
                        padding: "0.55rem 1rem", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)",
                        color: "var(--text)", fontWeight: 700, fontFamily: "inherit", fontSize: "0.88rem", cursor: "pointer",
                      }}>Messages</button>
                    )}
                  </div>
                  {rowError[l.id] && <div role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem", marginTop: 6 }}>{rowError[l.id]}</div>}
                </>
              )}
            </div>
          </ListingCard>
        )
      })}

      {editing && <ListingForm listing={editing} me={me} onClose={() => { setEditing(null); load() }} onSaved={load} />}
      {creating && <ListingForm me={me} onClose={() => { setCreating(false); load() }} onSaved={load} />}
    </div>
  )
}
