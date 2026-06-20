'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

function EnrichCard() {
  const [status, setStatus]   = useState('idle') // idle | running | done | error
  const [result, setResult]   = useState(null)
  const [totalDone, setTotal] = useState(0)

  async function runBatch() {
    setStatus('running')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/enrich-dvd?limit=50', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })
      const data = await res.json()
      setResult(data)
      setTotal(prev => prev + (data.enriched || 0))
      setStatus(data.enriched === 0 && data.skipped > 0 ? 'done' : 'idle')
    } catch (err) {
      setResult({ error: err.message })
      setStatus('error')
    }
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', padding: '1.25rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '1.3rem' }}>🖼️</span>
        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Enrich DVD Library</div>
      </div>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginBottom: '1rem', lineHeight: 1.5 }}>
        Fetches posters, plot, runtime, director and cast from TMDB / OMDb for DVD items missing images. Run in batches of 50 — click repeatedly until complete.
      </p>

      {result && (
        <div style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.85rem', fontSize: '0.8rem', lineHeight: 1.7 }}>
          {result.error ? (
            <span style={{ color: 'var(--danger)' }}>Error: {result.error}</span>
          ) : (
            <>
              <div>✓ Enriched this batch: <strong>{result.enriched}</strong></div>
              <div>↷ Skipped (already done / no match): <strong>{result.skipped}</strong></div>
              {result.failed > 0 && <div style={{ color: 'var(--danger)' }}>✕ Failed: {result.failed}</div>}
              <div style={{ color: 'var(--teal)', fontWeight: 600 }}>Total enriched this session: {totalDone}</div>
              {result.enriched === 0 && result.skipped > 0 && (
                <div style={{ color: '#15803d', fontWeight: 700, marginTop: '0.25rem' }}>All items processed!</div>
              )}
            </>
          )}
        </div>
      )}

      <button
        onClick={runBatch}
        disabled={status === 'running'}
        style={{
          background: status === 'done' ? '#15803d' : 'var(--teal)',
          color: '#fff', border: 'none', borderRadius: '10px',
          padding: '0.65rem 1.25rem', fontWeight: 700, fontSize: '0.88rem',
          cursor: status === 'running' ? 'not-allowed' : 'pointer',
          opacity: status === 'running' ? 0.6 : 1, fontFamily: 'inherit',
        }}
      >
        {status === 'running' ? 'Enriching… (up to 30s)' : status === 'done' ? '✓ All done' : result ? 'Run next batch →' : 'Start enrichment'}
      </button>
    </div>
  )
}

export default function AdminPage() {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '1rem 1rem 6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
        <span style={{ fontSize: '1.5rem' }}>⚙️</span>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--amber)' }}>Admin</h1>
      </div>

      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
        Data Tools
      </div>

      <EnrichCard />

      <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--surface2)', borderRadius: '12px', fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
        <strong>More admin tools coming soon:</strong> manage members, screenings, events, bar products, and notices.
      </div>
    </div>
  )
}
