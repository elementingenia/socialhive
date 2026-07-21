"use client"
import { useMemo } from "react"
import { describeRule, generateOccurrences, needsMonthEndChoice } from "@/lib/recurrence"

// EC-facing recurrence builder for the club event form. Curated options only
// (scope §2/§4). Emits a config object via onChange; renders a live plain-English
// summary + the next 3 generated dates, which is the main guard against an EC
// picking the wrong pattern (scope §8). Content-defined clubs (Book Club) pass
// mode="pattern" and get the same picker minus horizon (they generate nothing).
const WD = [["Sun",0],["Mon",1],["Tue",2],["Wed",3],["Thu",4],["Fri",5],["Sat",6]]
const ORD = [["1st",1],["2nd",2],["3rd",3],["4th",4],["Last","last"]]

export default function RecurrencePicker({ value, onChange, startDate, colour = "var(--purple)", mode = "series" }) {
  const v = value || {}
  const set = (patch) => onChange({ ...v, ...patch })
  const setCfg = (patch) => onChange({ ...v, rule_config: { ...(v.rule_config || {}), ...patch } })
  const cfg = v.rule_config || {}

  const preview = useMemo(() => {
    if (!v.enabled || !v.rule_type || !startDate) return []
    try {
      return generateOccurrences(
        { rule_type: v.rule_type, rule_config: cfg, start_date: startDate,
          month_end_policy: v.month_end_policy || "clamp", horizon_months: v.horizon_months || 12 },
        { count: 3 })
    } catch { return [] }
  }, [v.enabled, v.rule_type, JSON.stringify(cfg), startDate, v.month_end_policy, v.horizon_months])

  const chip = (active) => ({
    padding: "0.4rem 0.7rem", borderRadius: 8, fontFamily: "inherit", fontSize: "0.8rem",
    fontWeight: 700, cursor: "pointer",
    border: active ? `1px solid ${colour}` : "1px solid var(--border)",
    background: active ? colour : "var(--surface)", color: active ? "#fff" : "var(--text)",
  })
  const rules = [["weekly","Weekly"],["fortnightly","Fortnightly"],["monthly_date","Monthly (date)"],["monthly_weekday","Monthly (weekday)"]]
  const fmtPreview = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" })

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "0.85rem", marginTop: "0.5rem" }}>
      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
        <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{mode === "pattern" ? "Set a meeting pattern" : "Repeats"}</span>
        <input type="checkbox" checked={!!v.enabled} onChange={e => set({ enabled: e.target.checked })} />
      </label>
      {mode === "pattern" && (
        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: 4 }}>
          Pre-fills the date each time you add an event — one book at a time, so no dates are generated ahead.
        </div>
      )}

      {v.enabled && (
        <div style={{ marginTop: "0.7rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {rules.map(([k, lbl]) => <button key={k} type="button" style={chip(v.rule_type === k)} onClick={() => set({ rule_type: k })}>{lbl}</button>)}
          </div>

          {(v.rule_type === "weekly") && (
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: 4 }}>On</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                {WD.map(([lbl, n]) => {
                  const on = (cfg.weekdays || []).includes(n)
                  return <button key={n} type="button" style={chip(on)} onClick={() => setCfg({ weekdays: on ? (cfg.weekdays || []).filter(x => x !== n) : [...(cfg.weekdays || []), n] })}>{lbl}</button>
                })}
              </div>
            </div>
          )}

          {v.rule_type === "fortnightly" && (
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: 4 }}>Every second…</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                {WD.map(([lbl, n]) => <button key={n} type="button" style={chip(cfg.weekday === n)} onClick={() => setCfg({ weekday: n })}>{lbl}</button>)}
              </div>
            </div>
          )}

          {v.rule_type === "monthly_date" && (
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: 4 }}>Day of the month</div>
              <input type="number" min={1} max={31} value={cfg.day || ""} onChange={e => setCfg({ day: Math.max(1, Math.min(31, Number(e.target.value) || 1)) })}
                style={{ width: 90, padding: "0.5rem 0.7rem", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", fontSize: "0.9rem" }} />
              {needsMonthEndChoice({ rule_type: "monthly_date", rule_config: cfg }) && (
                <div style={{ marginTop: "0.5rem", background: colour + "12", borderRadius: 10, padding: "0.6rem" }}>
                  <div style={{ fontSize: "0.78rem", marginBottom: "0.4rem" }}>Some months are shorter. For those months:</div>
                  <div style={{ display: "flex", gap: "0.35rem" }}>
                    <button type="button" style={chip((v.month_end_policy || "clamp") === "clamp")} onClick={() => set({ month_end_policy: "clamp" })}>Use last day</button>
                    <button type="button" style={chip(v.month_end_policy === "skip")} onClick={() => set({ month_end_policy: "skip" })}>Skip that month</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {v.rule_type === "monthly_weekday" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: 4 }}>Which</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                  {ORD.map(([lbl, o]) => <button key={String(o)} type="button" style={chip(String(cfg.ordinal) === String(o))} onClick={() => setCfg({ ordinal: o })}>{lbl}</button>)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: 4 }}>Weekday</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                  {WD.map(([lbl, n]) => <button key={n} type="button" style={chip(cfg.weekday === n)} onClick={() => setCfg({ weekday: n })}>{lbl}</button>)}
                </div>
              </div>
            </div>
          )}

          {mode === "series" && (
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: 4 }}>Generate dates for the next…</div>
              <div style={{ display: "flex", gap: "0.35rem" }}>
                {[3, 6, 12].map(m => <button key={m} type="button" style={chip((v.horizon_months || 6) === m)} onClick={() => set({ horizon_months: m })}>{m} months</button>)}
              </div>
            </div>
          )}

          {v.rule_type && preview.length > 0 && (
            <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "0.6rem 0.75rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.82rem", color: colour }}>{describeRule({ rule_type: v.rule_type, rule_config: cfg })}</div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", margin: "0.35rem 0 0.15rem" }}>Next dates:</div>
              {preview.map(d => <div key={d} style={{ fontSize: "0.8rem" }}>• {fmtPreview(d)}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
