"use client"
export default function BarPage() {
  return (
    <main style={{ padding: "2rem 1rem", textAlign: "center" }}>
      <div style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 64, height: 64, borderRadius: "50%",
        background: "var(--amber-light)", marginBottom: "1rem",
      }}>
        <span style={{ fontSize: "2rem" }}>🍺</span>
      </div>
      <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--amber-dark)", marginBottom: "0.5rem" }}>
        Community Bar
      </h1>
      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>Coming soon</p>
    </main>
  )
}
