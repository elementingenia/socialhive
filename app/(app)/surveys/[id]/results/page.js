"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { authedFetch } from "@/lib/getAuthToken"

const TYPE_LABEL = {
  single_choice: "Single choice", multi_choice: "Multiple choice",
  rating: "Rating (1-10)", yes_no: "Yes / No", free_text: "Free text",
}

// Coordinator-only (or, when the survey's outcome-visibility toggle allows
// it, an anonymised aggregate for any resident) results view -- see
// app/api/surveys/[id]/results/route.js's header comment for the exact
// gate. This page just renders whichever `mode` the API decided the viewer
// gets ('coordinator' full detail, or 'aggregate' anonymised) -- it does
// not re-derive permission client-side.
export default function SurveyResultsPage() {
  const { id } = useParams()
  const router = useRouter()
  const [data, setData] = useState(undefined) // undefined = loading
  const [error, setError] = useState("")

  useEffect(() => {
    authedFetch(`/api/surveys/${id}/results`).then(async res => {
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error || "Could not load results"); setData(null); return }
      setData(json)
    })
  }, [id])

  return (
    <div style={{ padding: "1rem", maxWidth: "640px", margin: "0 auto" }}>
      <button onClick={() => router.push("/surveys")} style={{
        background: "none", border: "none", color: "var(--text-dim)", fontSize: "0.9rem",
        padding: 0, marginBottom: "0.75rem", cursor: "pointer",
      }}>
        ← Surveys
      </button>

      {data === undefined && <div style={{ color: "var(--text-dim)" }}>Loading…</div>}
      {error && <div style={{ color: "var(--terracotta)" }}>{error}</div>}

      {data && (
        <>
          <h1 style={{ fontSize: "1.3rem", fontWeight: 800, margin: "0 0 0.2rem" }}>{data.survey.title}</h1>
          <div style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginBottom: "1rem" }}>
            {data.responseCount} response{data.responseCount === 1 ? "" : "s"}
            {data.mode === "aggregate" && " · anonymised summary"}
          </div>

          {data.mode === "aggregate" ? (
            <AggregateResults items={data.items} tally={data.tally} comments={data.comments} />
          ) : (
            <CoordinatorResults items={data.items} responses={data.responses} />
          )}
        </>
      )}
    </div>
  )
}

function questionLabel(q, number) {
  return `${number != null ? `${number}. ` : ""}${q.prompt}`
}

function AggregateResults({ items, tally, comments }) {
  return (
    <div>
      {items.map((item, i) => {
        const q = item.question
        const bucket = tally[q.id]
        const itemComments = comments?.[q.id]
        return (
          <div key={item.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "0.9rem", marginBottom: "0.7rem" }}>
            <div style={{ fontWeight: 700, marginBottom: "0.3rem" }}>{questionLabel(q, i + 1)}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: "0.5rem" }}>{TYPE_LABEL[q.type]}</div>

            {(q.type === "single_choice" || q.type === "multi_choice") && (q.choices || []).map(c => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.2rem 0", fontSize: "0.9rem" }}>
                <span>{c.label}</span><strong>{bucket?.[c.id] ?? 0}</strong>
              </div>
            ))}

            {q.type === "rating" && bucket && (
              <div>
                <div style={{ fontSize: "0.9rem", marginBottom: "0.3rem" }}>
                  Average: <strong>{bucket.count ? (bucket.sum / bucket.count).toFixed(1) : "—"}</strong> ({bucket.count} response{bucket.count === 1 ? "" : "s"})
                </div>
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                  <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "0.1rem 0", fontSize: "0.8rem", color: "var(--text-dim)" }}>
                    <span>{n}</span><span>{bucket.distribution?.[n] ?? 0}</span>
                  </div>
                ))}
              </div>
            )}

            {q.type === "yes_no" && bucket && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.2rem 0", fontSize: "0.9rem" }}><span>Yes</span><strong>{bucket.yes}</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.2rem 0", fontSize: "0.9rem" }}><span>No</span><strong>{bucket.no}</strong></div>
              </div>
            )}

            {q.type === "free_text" && (
              Array.isArray(bucket) && bucket.length > 0 ? (
                bucket.map((t, i) => (
                  <div key={i} style={{ padding: "0.4rem 0.6rem", background: "var(--surface2)", borderRadius: "8px", fontSize: "0.85rem", marginBottom: "0.3rem" }}>{t}</div>
                ))
              ) : (
                <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>No responses yet.</div>
              )
            )}

            {Array.isArray(itemComments) && itemComments.length > 0 && (
              <div style={{ marginTop: "0.5rem" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>Comments</div>
                {itemComments.map((t, i) => (
                  <div key={i} style={{ padding: "0.4rem 0.6rem", background: "var(--surface2)", borderRadius: "8px", fontSize: "0.85rem", marginBottom: "0.3rem" }}>{t}</div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function CoordinatorResults({ items, responses }) {
  return (
    <div>
      {responses.length === 0 && <div style={{ color: "var(--text-dim)", padding: "1.5rem 0", textAlign: "center" }}>No responses yet.</div>}
      {responses.map(r => (
        <div key={r.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "0.9rem", marginBottom: "0.7rem" }}>
          <div style={{ fontWeight: 700, marginBottom: "0.15rem" }}>
            {r.member.name}{r.member.house_number ? ` · ${r.member.house_number}` : ""}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: "0.6rem" }}>
            Submitted {new Date(r.submittedAt).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
          </div>
          {items.map((item, i) => {
            const q = item.question
            const a = r.answers[q.id]
            return (
              <div key={item.id} style={{ padding: "0.3rem 0", borderTop: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{questionLabel(q, i + 1)}</div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{formatAnswer(q, a)}</div>
                {a?.comment && (
                  <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontStyle: "italic", marginTop: "0.15rem" }}>"{a.comment}"</div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function formatAnswer(q, a) {
  if (!a || (a.choice_id == null && a.choice_ids == null && a.rating_value == null && a.yes_no == null && a.free_text == null)) {
    return <span style={{ color: "var(--text-dim)", fontWeight: 400, fontStyle: "italic" }}>No answer</span>
  }
  if (q.type === "single_choice") return (q.choices || []).find(c => c.id === a.choice_id)?.label || "—"
  if (q.type === "multi_choice") return (a.choice_ids || []).map(id => (q.choices || []).find(c => c.id === id)?.label).filter(Boolean).join(", ") || "—"
  if (q.type === "rating") return a.rating_value
  if (q.type === "yes_no") return a.yes_no ? "Yes" : "No"
  if (q.type === "free_text") return a.free_text
  return "—"
}
