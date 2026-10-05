"use client"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@/lib/UserContext"
import ManageAreaScreen from "@/components/ManageAreaScreen"
import { authedFetch } from "@/lib/getAuthToken"
import { MIN_LISTING_CAP, MAX_LISTING_CAP, DEFAULT_LISTING_CAP } from "@/lib/swap"

// Manage Swap & Sell -- admin only (no Owner tier: same reasoning as
// Happenings News). Show/hide per deployment, the active-listing cap
// (decision 6, starts at 2), reports, hidden listings and blocks.
const C = "var(--swap)"
const card = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "1rem" }
const smallBtn = (colour = C) => ({
  padding: "0.5rem 0.85rem", borderRadius: 10, border: `1px solid ${colour}`, background: "var(--surface)",
  color: colour, fontWeight: 700, fontFamily: "inherit", fontSize: "0.85rem", cursor: "pointer",
})

export default function SwapManagePage() {
  return (
    <ManageAreaScreen contextType="hub" contextKey="swap" backHref="/swap" backLabel="Swap & Sell" title="Manage Swap & Sell" colour={C}>
      <AdminOnly />
    </ManageAreaScreen>
  )
}

function AdminOnly() {
  const { isAdmin } = useUser()
  if (!isAdmin) return null
  return (<><Visibility /><ListingCap /><Reports /><Blocks /></>)
}

function useSwapSettings() {
  const [settings, setSettings] = useState(null)
  useEffect(() => {
    fetch("/api/hub-settings").then(r => r.json()).then(j => setSettings(j?.swap || {})).catch(() => setSettings({}))
  }, [])
  return [settings, setSettings]
}

async function patchSettings(body) {
  const res = await authedFetch("/api/hub-settings", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hub_type: "swap", ...body }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || "Could not update")
}

function Visibility() {
  const router = useRouter()
  const [settings, setSettings] = useSwapSettings()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function toggle(field) {
    setError(""); setSaving(true)
    const next = !settings[field]
    try { await patchSettings({ [field]: next }); setSettings(s => ({ ...s, [field]: next })) }
    catch (err) { setError(err.message) }
    setSaving(false)
  }

  const row = (field, label, onText, offText) => (
    <button type="button" onClick={() => toggle(field)} disabled={saving} style={{
      background: settings[field] ? C : "transparent", color: settings[field] ? "#fff" : C,
      border: `1px solid ${C}`, borderRadius: "10px", padding: "0.6rem 1.1rem", fontWeight: 700,
      fontSize: "0.9rem", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
    }}>{label}: {settings[field] ? onText : offText}</button>
  )

  return (
    <div style={card}>
      <div style={{ fontWeight: 700, marginBottom: "0.4rem" }}>Show Swap & Sell to residents</div>
      <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
        Preview and Production are switched separately. While hidden, admins can still use it to try it out.
      </p>
      {settings === null ? <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {row("enabled", "Preview", "Visible — tap to hide", "Hidden — tap to show")}
          {row("production_enabled", "Production", "Live to residents — tap to hide", "Hidden — tap to go live")}
        </div>
      )}
      {error && <div role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem", marginTop: "0.5rem" }}>{error}</div>}
      <button type="button" onClick={() => router.push("/swap")} style={{ ...smallBtn(), marginTop: "0.75rem" }}>Open Swap &amp; Sell →</button>
    </div>
  )
}

function ListingCap() {
  const [settings, setSettings] = useSwapSettings()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const cap = settings?.listing_cap ?? DEFAULT_LISTING_CAP

  async function set(next) {
    if (next < MIN_LISTING_CAP || next > MAX_LISTING_CAP) return
    setError(""); setSaving(true)
    try { await patchSettings({ swap_listing_cap: next }); setSettings(s => ({ ...s, listing_cap: next })) }
    catch (err) { setError(err.message) }
    setSaving(false)
  }

  const stepBtn = { width: 48, height: 48, borderRadius: 12, border: `1px solid ${C}`, background: "var(--surface)", color: C, fontSize: "1.4rem", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }
  return (
    <div style={card}>
      <div style={{ fontWeight: 700, marginBottom: "0.4rem" }}>Active listings per resident</div>
      <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
        The most each resident can have showing at once. Reserved listings count; Gone and expired ones don&apos;t.
      </p>
      {settings === null ? <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</div> : (
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button type="button" aria-label="One fewer" onClick={() => set(cap - 1)} disabled={saving || cap <= MIN_LISTING_CAP} style={{ ...stepBtn, opacity: cap <= MIN_LISTING_CAP ? 0.4 : 1 }}>−</button>
          <span style={{ fontSize: "1.5rem", fontWeight: 800, minWidth: 32, textAlign: "center" }} aria-live="polite">{cap}</span>
          <button type="button" aria-label="One more" onClick={() => set(cap + 1)} disabled={saving || cap >= MAX_LISTING_CAP} style={{ ...stepBtn, opacity: cap >= MAX_LISTING_CAP ? 0.4 : 1 }}>+</button>
        </div>
      )}
      {error && <div role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem", marginTop: "0.5rem" }}>{error}</div>}
    </div>
  )
}

function Reports() {
  const router = useRouter()
  const [data, setData] = useState(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await authedFetch("/api/swap/reports").catch(() => null)
    const json = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) { setError(json.error || "Couldn't load reports"); setData({ open: [], resolved: [], hidden: [] }); return }
    setData(json)
  }, [])
  useEffect(() => { load() }, [load])

  async function act(url, method, body) {
    setBusy(true); setError("")
    const res = await authedFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null)
    const json = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res?.ok) { setError(json.error || "Couldn't do that — please try again."); return }
    load()
  }

  return (
    <div style={card}>
      <div style={{ fontWeight: 700, marginBottom: "0.6rem" }}>Reports</div>
      {data === null ? <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</div> : (
        <>
          {data.open.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: "0.88rem" }}>No open reports.</div>}
          {data.open.map(r => (
            <div key={r.id} style={{ borderTop: "1px solid var(--border)", padding: "0.75rem 0" }}>
              <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>
                {r.kind === "conversation" ? "Conversation about " : "Listing: "}{r.listing_title}
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-dim)" }}>
                Listed by {r.seller_name || "—"} · reported by {r.reporter_name} · {new Date(r.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" })}
                {r.listing_hidden ? " · listing hidden" : ""}
              </div>
              {r.reason && <div style={{ fontSize: "0.9rem", margin: "0.35rem 0", whiteSpace: "pre-wrap" }}>&ldquo;{r.reason}&rdquo;</div>}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {r.conversation_id && <button type="button" onClick={() => router.push(`/swap/messages/${r.conversation_id}`)} style={smallBtn()}>Read conversation</button>}
                {r.listing_id && !r.listing_hidden && <button type="button" disabled={busy} onClick={() => act(`/api/swap/${r.listing_id}`, "PATCH", { hidden: true })} style={smallBtn("var(--danger)")}>Hide listing</button>}
                {r.seller_id && <button type="button" disabled={busy} onClick={() => act("/api/swap/blocks", "POST", { member_id: r.seller_id, reason: r.reason })} style={smallBtn("var(--danger)")}>Block seller from listing</button>}
                <button type="button" disabled={busy} onClick={() => act("/api/swap/reports", "PATCH", { id: r.id })} style={smallBtn("var(--text-dim)")}>Mark dealt with</button>
              </div>
            </div>
          ))}

          {data.hidden.length > 0 && (
            <>
              <div style={{ fontWeight: 700, margin: "1rem 0 0.4rem" }}>Hidden listings</div>
              {data.hidden.map(l => (
                <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--border)", padding: "0.5rem 0" }}>
                  <span style={{ fontSize: "0.9rem", overflowWrap: "anywhere" }}>{l.title} <span style={{ color: "var(--text-dim)" }}>· {l.seller_name}</span></span>
                  <button type="button" disabled={busy} onClick={() => act(`/api/swap/${l.id}`, "PATCH", { hidden: false })} style={smallBtn()}>Put back</button>
                </div>
              ))}
            </>
          )}

          {data.resolved.length > 0 && (
            <details style={{ marginTop: "0.75rem" }}>
              <summary style={{ cursor: "pointer", fontSize: "0.88rem", color: "var(--text-dim)" }}>Dealt with ({data.resolved.length})</summary>
              {data.resolved.map(r => (
                <div key={r.id} style={{ fontSize: "0.85rem", color: "var(--text-dim)", padding: "0.35rem 0" }}>
                  {r.listing_title} — reported by {r.reporter_name}
                </div>
              ))}
            </details>
          )}
        </>
      )}
      {error && <div role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem", marginTop: "0.5rem" }}>{error}</div>}
    </div>
  )
}

function Blocks() {
  const [blocks, setBlocks] = useState(null)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    const res = await authedFetch("/api/swap/blocks").catch(() => null)
    const json = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) { setError(json.error || "Couldn't load blocks"); setBlocks([]); return }
    setBlocks(json.blocks || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function unblock(memberId) {
    const res = await authedFetch("/api/swap/blocks", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ member_id: memberId }),
    }).catch(() => null)
    if (!res?.ok) { setError("Couldn't unblock — please try again."); return }
    load()
  }

  return (
    <div style={card}>
      <div style={{ fontWeight: 700, marginBottom: "0.4rem" }}>Blocked from listing</div>
      <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", margin: "0 0 0.5rem" }}>
        Block a resident from a report above. They can still message about other people&apos;s listings.
      </p>
      {blocks === null ? <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</div>
        : blocks.length === 0 ? <div style={{ color: "var(--text-dim)", fontSize: "0.88rem" }}>Nobody is blocked.</div>
        : blocks.map(b => (
          <div key={b.member_id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--border)", padding: "0.5rem 0" }}>
            <span style={{ fontSize: "0.9rem" }}>{b.name}{b.reason ? <span style={{ color: "var(--text-dim)" }}> · {b.reason}</span> : null}</span>
            <button type="button" onClick={() => unblock(b.member_id)} style={smallBtn()}>Unblock</button>
          </div>
        ))}
      {error && <div role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem", marginTop: "0.5rem" }}>{error}</div>}
    </div>
  )
}
