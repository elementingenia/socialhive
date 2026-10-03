"use client"
// Street dropdown (migration 122). Residents can only pick from the list
// admins keep in Admin > Streets -- no free typing (Iain, 2026-10-03).
// Styled <select> per the UI standard (appearance:none + design tokens): it
// gives the phone's own large, accessible picker, which suits a short list.
// Renders nothing when no streets exist yet and none is set (vertical space).

const chevron = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")"

export default function StreetPicker({ streets, value, onChange, style, label, labelStyle }) {
  if (streets === null) return null            // still loading
  if (!streets.length && !value) return null   // nothing set up yet
  return (
    <div>
      {label && <label style={labelStyle}>{label}</label>}
      <select
        value={value || ""}
        onChange={e => onChange(e.target.value || null)}
        aria-label={typeof label === "string" ? label : "Street"}
        style={{
          ...style,
          appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
          backgroundImage: chevron, backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.9rem center", paddingRight: "2.4rem",
          fontFamily: "inherit", cursor: "pointer",
          color: value ? "var(--text)" : "var(--text-dim)",
        }}
      >
        <option value="">Choose your street…</option>
        {streets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  )
}
