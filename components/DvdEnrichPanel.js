"use client"
import { useState, useRef } from "react"
import { getAuthToken } from "@/lib/getAuthToken"

// DVD Library enrichment runner + failure catalogue. Moved out of the old
// Admin > Tools tile (Admin clean-up, Iain 2026-10-10): now shown in
// Admin > Show Time > Enrich AND on the Show Time Owner's Manage screen.
// /api/admin/enrich-dvd allows admins and Show Time Owners.
export default function DvdEnrichPanel() {
  const [status,        setStatus]        = useState('idle')
  const [lastBatch,     setLastBatch]     = useState(null)
  const [totalEnriched, setTotalEnriched] = useState(0)
  const [totalFailed,   setTotalFailed]   = useState(0)
  const [totalSkipped,  setTotalSkipped]  = useState(0)
  const [batchCount,    setBatchCount]    = useState(0)
  const [failures,      setFailures]      = useState([])   // accumulated across batches
  const [catalogue,     setCatalogue]     = useState(null) // loaded from DB
  const [showCatalogue, setShowCatalogue] = useState(false)
  const [loadingCat,    setLoadingCat]    = useState(false)
  const stopRef = useRef(false)

  async function runAll() {
    stopRef.current = false
    setStatus('running')
    setTotalEnriched(0)
    setTotalFailed(0)
    setTotalSkipped(0)
    setBatchCount(0)
    setLastBatch(null)
    setFailures([])

    let runningEnriched = 0
    let runningFailed   = 0
    let runningSkipped  = 0
    let batches = 0
    let allFailures = []

    while (!stopRef.current) {
      try {
        // Server-side writes — route uses service role, no RLS issues
        const res  = await fetch('/api/admin/enrich-dvd?limit=20', { headers:{ Authorization:`Bearer ${await getAuthToken()}` } })
        const data = await res.json()
        if (data.error) { setStatus('error'); return }
        batches++

        if (data.processed === 0) {
          setStatus('done')
          return
        }

        const batchEnriched = data.enriched  || 0
        const batchFailed   = data.failed    || 0
        const batchSkipped  = data.skipped   || 0
        const batchFails    = (data.results  || []).filter(r => r.status !== 'ok')

        runningEnriched += batchEnriched
        runningFailed   += batchFailed
        runningSkipped  += batchSkipped
        allFailures = [...allFailures, ...batchFails]

        setLastBatch({ enriched: batchEnriched, failed: batchFailed, skipped: batchSkipped, processed: data.processed })
        setTotalEnriched(runningEnriched)
        setTotalFailed(runningFailed)
        setTotalSkipped(runningSkipped)
        setBatchCount(batches)
        setFailures([...allFailures])

        await new Promise(r => setTimeout(r, 500))
      } catch(err) {
        setLastBatch({ error: err.message })
        setStatus('error')
        return
      }
    }
    setStatus('stopped')
  }

  async function loadCatalogue() {
    setLoadingCat(true)
    const res = await fetch('/api/admin/enrich-dvd?catalogue=true', { headers:{ Authorization:`Bearer ${await getAuthToken()}` } })
    const data = await res.json()
    setCatalogue(data.failures || [])
    setShowCatalogue(true)
    setLoadingCat(false)
  }

  function stop() { stopRef.current = true }

  const isRunning = status === 'running'
  const catNoMatch = catalogue?.filter(f => f.enrichment_status === 'no_match') || []
  const catApiErr  = catalogue?.filter(f => f.enrichment_status === 'api_error') || []

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>

      {/* ── Enrichment runner ── */}
      <div style={{ background:'var(--surface)', borderRadius:'14px', border:'1px solid var(--border)', padding:'1.25rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'0.5rem' }}>
          <span style={{ fontSize:'1.3rem' }}>🖼️</span>
          <div style={{ fontWeight:700, fontSize:'0.95rem' }}>Enrich DVD Library</div>
        </div>
        <p style={{ fontSize:'0.82rem', color:'var(--text-dim)', marginBottom:'1rem', lineHeight:1.5 }}>
          Auto-runs batches of 50. Skips titles already marked "not found". Keep this tab open.
        </p>

        {(isRunning || status === 'done' || status === 'stopped' || status === 'error') && (
          <div style={{ background:'var(--surface2)', borderRadius:'10px', padding:'0.75rem', marginBottom:'0.85rem', fontSize:'0.8rem', lineHeight:1.9 }}>
            <div style={{ fontWeight:700, color: status==='done' ? '#15803d' : status==='error' ? 'var(--danger)' : 'var(--teal)', marginBottom:'0.35rem' }}>
              {status==='running' && `⏳ Running… batch ${batchCount}`}
              {status==='done'    && '✅ All done!'}
              {status==='stopped' && `⏸ Stopped after ${batchCount} batches`}
              {status==='error'   && '✕ Error — see below'}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0.5rem', marginBottom:'0.25rem' }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontWeight:800, fontSize:'1.1rem', color:'#15803d' }}>{totalEnriched}</div>
                <div style={{ color:'var(--text-dim)', fontSize:'0.72rem' }}>Enriched</div>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontWeight:800, fontSize:'1.1rem', color:'var(--text-dim)' }}>{totalSkipped}</div>
                <div style={{ color:'var(--text-dim)', fontSize:'0.72rem' }}>No match</div>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontWeight:800, fontSize:'1.1rem', color: totalFailed>0 ? 'var(--danger)' : 'var(--text-dim)' }}>{totalFailed}</div>
                <div style={{ color:'var(--text-dim)', fontSize:'0.72rem' }}>API errors</div>
              </div>
            </div>
            {lastBatch?.error && <div style={{ color:'var(--danger)', marginTop:'0.35rem' }}>Error: {lastBatch.error}</div>}
          </div>
        )}

        <div style={{ display:'flex', gap:'0.6rem' }}>
          <button onClick={runAll} disabled={isRunning}
            style={{ flex:1, background:status==='done'?'#15803d':'var(--teal)', color:'#fff', border:'none', borderRadius:'10px', padding:'0.75rem', fontWeight:700, fontSize:'0.88rem', cursor:isRunning?'not-allowed':'pointer', opacity:isRunning?0.6:1 }}>
            {status==='idle'    && 'Run enrichment →'}
            {status==='running' && 'Running…'}
            {status==='done'    && '✓ Done — run again?'}
            {status==='stopped' && 'Resume'}
            {status==='error'   && 'Retry'}
          </button>
          {isRunning && (
            <button onClick={stop}
              style={{ background:'none', border:'1.5px solid var(--danger)', color:'var(--danger)', borderRadius:'10px', padding:'0.75rem 1rem', fontWeight:700, fontSize:'0.88rem', cursor:'pointer' }}>
              Stop
            </button>
          )}
        </div>
      </div>



      {/* ── Persistent catalogue (from DB) ── */}
      <div style={{ background:'var(--surface)', borderRadius:'14px', border:'1px solid var(--border)', padding:'1.25rem' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
          <div style={{ fontWeight:700, fontSize:'0.9rem' }}>Failure Catalogue</div>
          <button onClick={loadCatalogue} disabled={loadingCat}
            style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'8px', padding:'0.35rem 0.75rem', fontSize:'0.78rem', fontWeight:600, cursor:'pointer', color:'var(--text)' }}>
            {loadingCat ? 'Loading…' : showCatalogue ? 'Refresh' : 'Load from DB'}
          </button>
        </div>
        <p style={{ fontSize:'0.8rem', color:'var(--text-dim)', marginBottom: showCatalogue ? '1rem' : 0, lineHeight:1.5 }}>
          All titles marked "not found" or "API error" across all previous runs.
        </p>
        {showCatalogue && catalogue && (
          <>
            {catalogue.length === 0 && (
              <div style={{ fontSize:'0.85rem', color:'#15803d', fontWeight:600 }}>✓ No failures on record</div>
            )}
            {[['no_match','Not found on TMDB / OMDb', catNoMatch],['api_error','API / network errors (will retry)', catApiErr]].map(([key,label,items]) =>
              items.length > 0 && (
                <div key={key} style={{ marginBottom:'1rem' }}>
                  <div style={{ fontSize:'0.75rem', fontWeight:700, color: key==='api_error'?'var(--danger)':'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.5rem' }}>
                    {label} — {items.length} title{items.length!==1?'s':''}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.3rem', maxHeight:240, overflowY:'auto' }}>
                    {items.map(f => (
                      <div key={f.id} style={{ background:'var(--surface2)', borderRadius:'8px', padding:'0.45rem 0.75rem', fontSize:'0.8rem', display:'flex', justifyContent:'space-between', gap:'0.5rem' }}>
                        <span style={{ fontWeight:600 }}>{f.title}</span>
                        <span style={{ color:'var(--text-dim)', fontSize:'0.72rem', flexShrink:0 }}>{f.genre || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </>
        )}
      </div>

    </div>
  )
}
