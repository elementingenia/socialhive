"use client"
import { useState } from "react"
import { Sheet } from "@/components/ResidentEditPanel"
import ClubWatermarkPicker from "@/components/ClubWatermarkPicker"
import { CLUB_COLOURS } from "@/lib/clubColours"
import { authedFetch } from "@/lib/getAuthToken"

// Standalone "Club background" control -- Iain, 2026-07-24: Admins and this
// club's Owners/Contacts should be able to set colour + watermark image
// without going through the full Admin > Club Manager form. Everything here
// auto-saves (colour on click, image/position/zoom via ClubWatermarkPicker's
// own auto-save) through /api/clubs/appearance and /api/clubs/image, both
// gated admin-or-owner (lib/clubAuth.js) -- there's no separate Save step to
// forget. Uses Sheet's `footer` prop (added same day) for a persistent
// "Done" button pinned to the bottom -- Iain hit the sheet's Close button
// scrolling out of view on a tall picker and couldn't get back to it;
// Sheet's header is now sticky too, so this is belt-and-braces reachability.
export default function ClubAppearanceModal({ club, open, onClose, onUpdated }) {
  const [colour, setColour] = useState(club?.colour || CLUB_COLOURS[0].value)
  const [saving, setSaving] = useState(false)

  async function chooseColour(v) {
    if (v === colour || saving) return
    setColour(v)
    setSaving(true)
    await authedFetch("/api/clubs/appearance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ club_id: club.id, colour: v }),
    })
    setSaving(false)
    onUpdated?.({ colour: v })
  }

  const swatchHex = CLUB_COLOURS.find(c => c.value === colour)?.hex || (colour?.startsWith("#") ? colour : "#7c3aed")

  const doneButton = (
    <button onClick={onClose} type="button" style={{
      width: "100%", padding: "0.75rem", borderRadius: 10, border: "none",
      background: swatchHex, color: "#fff", fontWeight: 700, fontFamily: "inherit",
      fontSize: "0.95rem", cursor: "pointer",
    }}>Done</button>
  )

  return (
    <Sheet open={open} onClose={onClose} title={`${club?.name || "Club"} background`} footer={doneButton}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
        <div>
          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
            Colour
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {CLUB_COLOURS.map(c => (
              <button key={c.label} type="button" onClick={() => chooseColour(c.value)} title={c.label} disabled={saving} style={{
                width: 32, height: 32, borderRadius: "50%", background: c.hex, cursor: saving ? "not-allowed" : "pointer",
                border: colour === c.value ? "3px solid var(--text)" : "2px solid var(--border)",
              }} />
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
            Background image (optional)
          </div>
          <ClubWatermarkPicker
            clubId={club.id}
            imageUrl={club.image_url}
            posX={club.image_pos_x}
            posY={club.image_pos_y}
            zoom={club.image_zoom}
            colour={swatchHex}
            onUpdated={onUpdated}
          />
          <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "0.35rem" }}>
            Shows as a faint background across the whole club page, behind everything from the welcome banner down to the last event card.
          </div>
        </div>
      </div>
    </Sheet>
  )
}
