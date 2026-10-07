"use client"
// Swap & Sell shared client UI (Scope_Answered, Iain 2026-10-05): the
// listing card, the listing detail sheet, the create/edit form (with
// photos), and the one-time privacy note for Private residents.
import { useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { authedFetch } from "@/lib/getAuthToken"
import { resizeForUpload } from "@/lib/clientImageResize"
import { Sheet } from "@/components/Sheet"
import {
  TYPES, TYPE_LABELS, CATEGORIES, CONDITIONS, CONDITION_LABELS, MAX_PHOTOS, MAX_TITLE,
  MAX_DESCRIPTION, MAX_MESSAGE, NOT_ALLOWED_TEXT, PRIVACY_NOTE, priceLabel, statusLabel,
  contactButtonLabel, daysListedLabel,
} from "@/lib/swap"

export const SWAP = "var(--swap)"

export const inputStyle = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box",
  fontFamily: "inherit",
}

export function primaryButton(disabled) {
  return {
    width: "100%", padding: "0.8rem", borderRadius: 12, border: "none", background: SWAP, color: "#fff",
    fontWeight: 700, fontSize: "0.95rem", fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  }
}

export function StatusPill({ type, status }) {
  if (status === "available") return null
  const gone = status === "gone"
  return (
    <span style={{
      display: "inline-block", fontSize: "0.72rem", fontWeight: 700, padding: "0.15rem 0.55rem", borderRadius: 999,
      background: gone ? "var(--border)" : "var(--amber-light)", color: gone ? "var(--text-dim)" : "var(--text)",
      whiteSpace: "nowrap",
    }}>{statusLabel(type, status)}</span>
  )
}

/** Browse / My Listings card: main photo, title, price, status. */
export function ListingCard({ listing, onOpen, children }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14,
      overflow: "hidden", marginBottom: "0.75rem",
    }}>
      <div onClick={onOpen} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === "Enter") onOpen?.() }}
        style={{ display: "flex", gap: "0.8rem", padding: "0.75rem", cursor: "pointer", alignItems: "flex-start" }}>
        <div style={{
          flex: "0 0 84px", width: 84, height: 84, borderRadius: 10, overflow: "hidden",
          background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--text-dim)", fontSize: "0.72rem", textAlign: "center",
        }}>
          {listing.main_photo_url
            ? <img src={listing.main_photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            : "No photo"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "0.98rem", lineHeight: 1.3, overflowWrap: "anywhere" }}>{listing.title}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 4 }}>
            <span style={{ fontWeight: 800, fontSize: "1rem", color: SWAP }}>{priceLabel(listing)}</span>
            <StatusPill type={listing.type} status={listing.status} />
            {listing.is_mine && !children && <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-dim)" }}>Yours</span>}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: 4 }}>
            {listing.seller_name}{listing.seller_name ? " · " : ""}{daysListedLabel(listing.created_at)}
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}

// ── One-time privacy note (decision 4 / scope 3.6) ──────────────────────────
// ensure(me) resolves true once it's fine to post or message; for a Private
// resident who hasn't seen the note it shows it first and records the OK.
export function usePrivacyAck() {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const resolveRef = useRef(null)

  const ensure = useCallback((me) => {
    if (!me?.needsPrivacyAck) return Promise.resolve(true)
    return new Promise(resolve => { resolveRef.current = resolve; setOpen(true) })
  }, [])

  async function acknowledge() {
    setSaving(true)
    const res = await authedFetch("/api/swap/privacy-ack", { method: "POST" }).catch(() => null)
    setSaving(false)
    setOpen(false)
    resolveRef.current?.(!!res?.ok)
    resolveRef.current = null
  }

  const Modal = !open ? null : (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div role="dialog" aria-modal="true" style={{ background: "var(--surface)", borderRadius: 16, padding: "1.25rem",
        maxWidth: 380, width: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.25)", borderTop: `4px solid ${SWAP}` }}>
        <div style={{ fontWeight: 800, fontSize: "1rem", marginBottom: 8 }}>Your name is shown here</div>
        <div style={{ fontSize: "0.92rem", color: "var(--text-dim)", marginBottom: 18, lineHeight: 1.5 }}>{PRIVACY_NOTE}</div>
        <button type="button" onClick={acknowledge} disabled={saving} style={primaryButton(saving)}>
          {saving ? "Saving…" : "OK"}
        </button>
      </div>
    </div>
  )
  return { ensure, Modal }
}

// ── Listing detail sheet ────────────────────────────────────────────────────
export function ListingSheet({ listing, me, onClose, onChanged }) {
  const router = useRouter()
  const { ensure, Modal } = usePrivacyAck()
  const [photoIdx, setPhotoIdx] = useState(0)
  const [message, setMessage] = useState("")
  const [composing, setComposing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState("")
  const [notice, setNotice] = useState("")
  const [editing, setEditing] = useState(false)

  if (!listing) return null
  if (editing) {
    return <ListingForm listing={listing} me={me} onClose={() => { setEditing(false); onChanged?.(); onClose() }} onSaved={onChanged} />
  }
  const photos = listing.photos || []
  const photo = photos[photoIdx] || photos[0]
  const canContact = !listing.is_mine && listing.status !== "gone"

  async function send() {
    setError("")
    if (!(await ensure(me))) { setError("Couldn't save — please try again."); return }
    setBusy(true)
    const res = await authedFetch("/api/swap/conversations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing_id: listing.id, body: message }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res?.ok) { setError(json.error || "Couldn't send — check your connection and try again."); return }
    router.push(`/swap/messages/${json.conversation_id}`)
  }

  async function report() {
    setBusy(true); setError("")
    const res = await authedFetch("/api/swap/reports", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing_id: listing.id, reason }),
    }).catch(() => null)
    setBusy(false)
    if (!res?.ok) { setError("Couldn't send the report — please try again."); return }
    setReporting(false); setReason(""); setNotice("Thanks — an admin will take a look.")
  }

  async function setHidden(hidden) {
    setBusy(true); setError("")
    const res = await authedFetch(`/api/swap/${listing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hidden }),
    }).catch(() => null)
    setBusy(false)
    if (!res?.ok) { setError("Couldn't change that — please try again."); return }
    onChanged?.(); onClose()
  }

  return (
    <Sheet open onClose={onClose} title={listing.title}>
      <div style={{ padding: "1rem 1.25rem 2rem" }}>
        {photo && (
          <div style={{ marginBottom: "0.75rem" }}>
            <img src={photo.url} alt="" style={{ width: "100%", maxHeight: 340, objectFit: "contain", borderRadius: 12, background: "var(--surface2)", display: "block" }} />
            {photos.length > 1 && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {photos.map((p, i) => (
                  <button key={p.id} type="button" onClick={() => setPhotoIdx(i)} aria-label={`Photo ${i + 1}`}
                    style={{ width: 56, height: 56, padding: 0, borderRadius: 8, overflow: "hidden", cursor: "pointer",
                      border: i === photoIdx ? `3px solid ${SWAP}` : "1px solid var(--border)", background: "none" }}>
                    <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontWeight: 800, fontSize: "1.25rem", color: SWAP }}>{priceLabel(listing)}</span>
          <StatusPill type={listing.type} status={listing.status} />
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: "0.75rem" }}>
          {listing.category}{listing.condition ? ` · ${CONDITION_LABELS[listing.condition]}` : ""} · {listing.seller_name} · {daysListedLabel(listing.created_at)}
        </div>
        {listing.description && (
          <div style={{ fontSize: "0.95rem", lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginBottom: "1rem" }}>{listing.description}</div>
        )}
        <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginBottom: "1rem" }}>
          Collect from {listing.type === "wanted" ? "each other" : "the seller"} — arrange it by message.
        </div>

        {listing.is_mine && (
          <>
            <button type="button" onClick={() => setEditing(true)} style={primaryButton(false)}>
              Edit listing
            </button>
            <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginTop: 8, marginBottom: "1rem" }}>
              Mark it Reserved or Gone from <strong style={{ color: "var(--text)" }}>My Listings</strong>.
            </div>
          </>
        )}

        {canContact && (listing.my_conversation_id ? (
          <button type="button" onClick={() => router.push(`/swap/messages/${listing.my_conversation_id}`)} style={primaryButton(false)}>
            Open your conversation
          </button>
        ) : composing ? (
          <div>
            <textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={MAX_MESSAGE} rows={4} autoFocus
              placeholder={listing.type === "wanted" ? "Tell them what you have…" : "Hi, is this still available?"}
              style={{ ...inputStyle, resize: "vertical" }} />
            <button type="button" onClick={send} disabled={busy || !message.trim()} style={{ ...primaryButton(busy || !message.trim()), marginTop: 8 }}>
              {busy ? "Sending…" : "Send"}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setComposing(true)} style={primaryButton(false)}>
            {contactButtonLabel(listing.type)}
          </button>
        ))}

        {error && <div role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem", marginTop: 8 }}>{error}</div>}
        {notice && <div style={{ color: SWAP, fontSize: "0.85rem", marginTop: 8, fontWeight: 600 }}>{notice}</div>}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: "1.25rem", alignItems: "center" }}>
          {!listing.is_mine && !reporting && !notice && (
            <button type="button" onClick={() => setReporting(true)} style={{
              background: "none", border: "none", color: "var(--text-dim)", textDecoration: "underline",
              fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit", padding: "0.4rem 0",
            }}>Report this listing</button>
          )}
          {me?.isAdmin && (
            <button type="button" onClick={() => setHidden(!listing.hidden_at)} disabled={busy} style={{
              background: "none", border: "1px solid var(--danger)", color: "var(--danger)", borderRadius: 10,
              fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: "0.45rem 0.9rem",
            }}>{listing.hidden_at ? "Put back (admin)" : "Hide listing (admin)"}</button>
          )}
        </div>
        {reporting && (
          <div style={{ marginTop: 8 }}>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500}
              placeholder="What's wrong with it? (optional)" style={{ ...inputStyle, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="button" onClick={report} disabled={busy} style={{ ...primaryButton(busy), background: "var(--danger)" }}>Send report</button>
              <button type="button" onClick={() => { setReporting(false); setReason("") }} style={{ ...primaryButton(false), background: "var(--surface2)", color: "var(--text)" }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      {Modal}
    </Sheet>
  )
}

// ── Create / edit form ──────────────────────────────────────────────────────
function ButtonGroup({ options, value, onChange, labels }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map(o => {
        const active = value === o
        return (
          <button key={String(o)} type="button" onClick={() => onChange(o)} aria-pressed={active} style={{
            flex: "1 1 0", minWidth: 80, padding: "0.6rem 0.5rem", borderRadius: 10, fontFamily: "inherit",
            fontSize: "0.9rem", fontWeight: 700, cursor: "pointer",
            border: `1px solid ${active ? SWAP : "var(--border)"}`,
            background: active ? SWAP : "var(--surface)", color: active ? "#fff" : "var(--text-dim)",
          }}>{labels[o]}</button>
        )
      })}
    </div>
  )
}

function CategoryPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} style={{
        ...inputStyle, textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between",
        color: value ? "var(--text)" : "var(--text-dim)",
      }}>
        <span>{value || "Choose a category"}</span><span aria-hidden>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, marginTop: 4, overflow: "hidden" }}>
          {CATEGORIES.map(c => (
            <button key={c} type="button" onClick={() => { onChange(c); setOpen(false) }} style={{
              display: "block", width: "100%", textAlign: "left", padding: "0.65rem 1rem", border: "none",
              borderBottom: "1px solid var(--border)", background: c === value ? "var(--surface2)" : "var(--surface)",
              color: "var(--text)", fontFamily: "inherit", fontSize: "0.92rem", cursor: "pointer",
              fontWeight: c === value ? 700 : 400,
            }}>{c}</button>
          ))}
        </div>
      )}
    </div>
  )
}

const label = { display: "block", fontSize: "0.85rem", fontWeight: 700, margin: "0.9rem 0 0.35rem" }

/**
 * Create (listing = null) or edit (listing given). Step 1 is the details;
 * step 2 is photos (up to 4, ★ marks the main one). Calls onSaved() on any
 * successful change so the caller can reload.
 */
export function ListingForm({ listing, me, onClose, onSaved }) {
  const editing = !!listing
  const { ensure, Modal } = usePrivacyAck()
  const [step, setStep] = useState("details")
  const [id, setId] = useState(listing?.id || null)
  const [type, setType] = useState(listing?.type || "sale")
  const [title, setTitle] = useState(listing?.title || "")
  const [description, setDescription] = useState(listing?.description || "")
  const [priceMode, setPriceMode] = useState(listing?.price_is_offers ? "offers" : "price")
  const [price, setPrice] = useState(listing?.price_dollars != null ? String(listing.price_dollars) : "")
  const [category, setCategory] = useState(listing?.category || "")
  const [condition, setCondition] = useState(listing?.condition || null)
  const [allowed, setAllowed] = useState(editing)
  const [photos, setPhotos] = useState(listing?.photos || [])
  const [mainId, setMainId] = useState(listing?.main_photo_id || listing?.photos?.[0]?.id || null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  function payload() {
    const p = { type, title, description, category, condition: type === "wanted" ? null : condition }
    if (type === "sale") {
      p.price_is_offers = priceMode === "offers"
      p.price_dollars = priceMode === "offers" ? null : (price === "" ? "" : Number(price))
    }
    return p
  }

  function localError() {
    if (!title.trim()) return "Give it a title."
    if (!category) return "Choose a category."
    if (type === "sale" && priceMode === "price" && (price === "" || !/^\d+$/.test(price))) return "Enter a price in whole dollars, or choose Offers."
    if (!editing && !allowed) return "Please tick to confirm the item is allowed."
    return ""
  }

  async function saveDetails() {
    const le = localError()
    if (le) { setError(le); return }
    setError("")
    if (!editing && !(await ensure(me))) { setError("Couldn't save — please try again."); return }
    setBusy(true)
    const res = await authedFetch(editing ? `/api/swap/${id}` : "/api/swap", {
      method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing ? payload() : { ...payload(), allowed: true }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res?.ok) { setError(json.error || "Couldn't save — check your connection and try again."); return }
    if (!editing) setId(json.listing.id)
    onSaved?.()
    setStep("photos")
  }

  async function addPhotos(files) {
    setError(""); setBusy(true)
    let count = photos.length
    for (const raw of files) {
      if (count >= MAX_PHOTOS) { setError(`A listing can have at most ${MAX_PHOTOS} photos.`); break }
      try {
        const file = await resizeForUpload(raw)
        const fd = new FormData()
        fd.append("listing_id", id)
        fd.append("file", file, file.name || "photo.jpg")
        const res = await authedFetch("/api/swap/photos", { method: "POST", body: fd })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || "Couldn't add that photo")
        setPhotos(p => [...p, json.photo])
        if (json.is_main) setMainId(json.photo.id)
        count++
      } catch (err) {
        setError(err.message || "Couldn't add that photo")
        break
      }
    }
    setBusy(false)
    onSaved?.()
  }

  async function removePhoto(photoId) {
    setError(""); setBusy(true)
    const res = await authedFetch("/api/swap/photos", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photo_id: photoId }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res?.ok) { setError(json.error || "Couldn't remove that photo"); return }
    setPhotos(p => p.filter(x => x.id !== photoId))
    setMainId(json.main_photo_id || null)
    onSaved?.()
  }

  async function makeMain(photoId) {
    const prev = mainId
    setMainId(photoId)
    const res = await authedFetch(`/api/swap/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ main_photo_id: photoId }),
    }).catch(() => null)
    if (!res?.ok) { setMainId(prev); setError("Couldn't change the main photo"); return }
    onSaved?.()
  }

  const title_ = step === "photos" ? "Photos" : editing ? "Edit listing" : "New listing"

  return (
    <Sheet open onClose={onClose} title={title_}>
      <div style={{ padding: "0.25rem 1.25rem 2rem" }}>
        {step === "details" ? (
          <>
            <span style={label}>What is it?</span>
            <ButtonGroup options={TYPES} value={type} onChange={setType} labels={TYPE_LABELS} />

            <label style={label} htmlFor="swap-title">{type === "wanted" ? "What are you looking for?" : "Title"}</label>
            <input id="swap-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={MAX_TITLE} style={inputStyle}
              placeholder={type === "wanted" ? "e.g. Step ladder" : "e.g. Outdoor table and 4 chairs"} />

            {type === "sale" && (
              <>
                <span style={label}>Price</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 140px" }}>
                    <span style={{ fontWeight: 700 }}>$</span>
                    <input inputMode="numeric" value={priceMode === "offers" ? "" : price} disabled={priceMode === "offers"}
                      onChange={e => setPrice(e.target.value.replace(/[^\d]/g, ""))} placeholder="Whole dollars"
                      aria-label="Price in whole dollars" style={{ ...inputStyle, opacity: priceMode === "offers" ? 0.5 : 1 }} />
                  </div>
                  <button type="button" onClick={() => setPriceMode(m => m === "offers" ? "price" : "offers")} aria-pressed={priceMode === "offers"}
                    style={{
                      padding: "0.7rem 1rem", borderRadius: 10, fontFamily: "inherit", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer",
                      border: `1px solid ${priceMode === "offers" ? SWAP : "var(--border)"}`,
                      background: priceMode === "offers" ? SWAP : "var(--surface)", color: priceMode === "offers" ? "#fff" : "var(--text-dim)",
                    }}>Offers</button>
                </div>
              </>
            )}

            <span style={label}>Category</span>
            <CategoryPicker value={category} onChange={setCategory} />

            {type !== "wanted" && (
              <>
                <span style={label}>Condition <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optional)</span></span>
                <ButtonGroup options={CONDITIONS} value={condition} labels={CONDITION_LABELS}
                  onChange={c => setCondition(prev => prev === c ? null : c)} />
              </>
            )}

            <label style={label} htmlFor="swap-desc">Description <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optional)</span></label>
            <textarea id="swap-desc" value={description} onChange={e => setDescription(e.target.value)} maxLength={MAX_DESCRIPTION}
              rows={4} style={{ ...inputStyle, resize: "vertical" }} placeholder="Size, colour, anything a neighbour should know" />

            {!editing && (
              <>
                <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", margin: "1rem 0 0.5rem" }}>{NOT_ALLOWED_TEXT}</div>
                <button type="button" role="checkbox" aria-checked={allowed} onClick={() => setAllowed(a => !a)} style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "0.7rem 0.9rem", borderRadius: 10,
                  border: `1px solid ${allowed ? SWAP : "var(--border)"}`, background: "var(--surface)", cursor: "pointer",
                  fontFamily: "inherit", fontSize: "0.95rem", color: "var(--text)", textAlign: "left",
                }}>
                  <span aria-hidden style={{
                    flex: "0 0 24px", width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                    background: allowed ? SWAP : "var(--surface)", border: `2px solid ${allowed ? SWAP : "var(--border)"}`, color: "#fff", fontWeight: 800,
                  }}>{allowed ? "✓" : ""}</span>
                  This item is allowed
                </button>
              </>
            )}

            {error && <div role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem", marginTop: 10 }}>{error}</div>}
            <div style={{ marginTop: "1rem" }}>
              <button type="button" onClick={saveDetails} disabled={busy} style={primaryButton(busy)}>
                {busy ? "Saving…" : editing ? "Save — then photos →" : "Post — then add photos →"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: "0.88rem", color: "var(--text-dim)", margin: "0.75rem 0" }}>
              Up to {MAX_PHOTOS} photos. Tap ★ to choose the main photo people see first. Photos are optional.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: "1rem" }}>
              {photos.map(p => (
                <div key={p.id} style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden",
                  border: mainId === p.id ? `3px solid ${SWAP}` : "1px solid var(--border)" }}>
                  <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <button type="button" onClick={() => makeMain(p.id)} aria-label="Make this the main photo" disabled={busy}
                    style={{ position: "absolute", top: 6, left: 6, minWidth: 40, height: 40, borderRadius: 20, border: "none", cursor: "pointer",
                      fontSize: "0.85rem", fontWeight: 700, padding: "0 10px",
                      background: mainId === p.id ? SWAP : "rgba(255,255,255,0.9)", color: mainId === p.id ? "#fff" : "var(--text)" }}>
                    {mainId === p.id ? "★ Main" : "★"}
                  </button>
                  <button type="button" onClick={() => removePhoto(p.id)} aria-label="Remove photo" disabled={busy}
                    style={{ position: "absolute", top: 6, right: 6, width: 40, height: 40, borderRadius: 20, border: "none",
                      cursor: "pointer", background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: "1rem" }}>✕</button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <label style={{ aspectRatio: "1 / 1", borderRadius: 10, border: "2px dashed var(--border)", display: "flex",
                  flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: busy ? "wait" : "pointer",
                  color: "var(--text-dim)", fontSize: "0.9rem", gap: 4 }}>
                  <span style={{ fontSize: "1.8rem", lineHeight: 1 }}>{busy ? "…" : "+"}</span>
                  {busy ? "Uploading" : "Add photo"}
                  <input type="file" accept="image/*" multiple disabled={busy} style={{ display: "none" }}
                    onChange={e => { const f = Array.from(e.target.files || []); if (f.length) addPhotos(f); e.target.value = "" }} />
                </label>
              )}
            </div>
            {error && <div role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: 10 }}>{error}</div>}
            <button type="button" onClick={onClose} disabled={busy} style={primaryButton(busy)}>Done</button>
          </>
        )}
      </div>
      {Modal}
    </Sheet>
  )
}
