"use client"
// Bus driver chooser: Resident (the form's own member picker, passed as
// children) or Other (a typed name, e.g. the Community Manager). Shared by
// Groups & Clubs, Social and Special Events event forms (Iain, 2026-10-04).
import { BUS_DRIVER_NAME_MAX } from "@/lib/busDriver"

export default function BusDriverField({ mode, onModeChange, name, onNameChange, colour = "var(--teal)", inputStyle, children }) {
  const opts = [{ v: "resident", t: "Resident" }, { v: "other", t: "Other" }]
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {opts.map(o => {
          const on = mode === o.v
          return (
            <button key={o.v} type="button" onClick={() => onModeChange(o.v)}
              style={{ flex: 1, padding: "0.5rem 0.75rem", borderRadius: 10, fontFamily: "inherit",
                fontSize: "0.85rem", cursor: "pointer",
                border: `1.5px solid ${on ? colour : "var(--border)"}`,
                background: on ? colour : "var(--surface)",
                color: on ? "#fff" : "var(--text)", fontWeight: on ? 700 : 500 }}>{o.t}</button>
          )
        })}
      </div>
      {mode === "other" ? (
        <input type="text" value={name || ""} maxLength={BUS_DRIVER_NAME_MAX}
          onChange={e => onNameChange(e.target.value)}
          placeholder="Driver's name, e.g. Community Manager"
          style={inputStyle || { width: "100%", padding: "0.75rem 1rem", borderRadius: 10, border: "1px solid var(--border)",
            background: "var(--surface)", color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box", fontFamily: "inherit" }} />
      ) : children}
    </div>
  )
}
