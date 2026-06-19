"use client"
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

function parseStreaming(str) {
  if (!str) return []
  return str.replace(/^(Stream|Rent\/Buy|Buy|Rent):\s*/i, '').split(',').map(s => s.trim()).filter(Boolean)
}

function Stars({ value = 0, onChange, size = '1.4rem' }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1,2,3,4,5].map(n => (
        <span key={n} onClick={() => onChange?.(n)} style={{
          fontSize: size, cursor: onChange ? 'pointer' : 'default',
          color: n <= Math.round(value) ? '#f59e0b' : '#d1cec9',
          lineHeight: 1, userSelect: 'none',
        }}>★</span>
      ))}
    </div>
  )
}

const OVERLAY = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000,
}
const SHEET = {
  background: 'var(--surface)', borderRadius: '20px 20px 0 0',
  padding: '1.5rem', width: '100%', maxWidth: 600,
  maxHeight: '92vh', overflowY: 'auto',
}

export default function Movies() {
  const [movies, setMovies]           = useState([])
  const [search, setSearch]           = useState('')
  const [loading, setLoading]         = useState(true)
  const [memberId, setMemberId]       = useState(null)
  const [isAdmin, setIsAdmin]         = useState(false)
  const [userVotes, setUserVotes]     = useState({})
  const [avgVotes, setAvgVotes]       = useState({})
  const [selected, setSelected]       = useState(null)
  const [voteSaving, setVoteSaving]   = useState(false)

  // Add movie modal
  const [showAdd, setShowAdd]         = useState(false)
  const [addQuery, setAddQuery]       = useState('')
  const [addResults, setAddResults]   = useState([])
  const [addSearching, setAddSearching] = useState(false)
  const [addPicked, setAddPicked]     = useState(null)
  const [addSaving, setAddSaving]     = useState(false)
  const [addError, setAddError]       = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const [mRes, movRes, votRes] = await Promise.all([
      supabase.from('members').select('id,is_admin').eq('auth_id', session.user.id).single(),
      supabase.from('movies').select('*').order('title'),
      supabase.from('votes').select('movie_id,member_id,score'),
    ])

    const member = mRes.data
    if (member) { setMemberId(member.id); setIsAdmin(member.is_admin) }
    setMovies(movRes.data || [])

    const allVotes = votRes.data || []
    const totals = {}, counts = {}
    allVotes.forEach(({ movie_id, score }) => {
      totals[movie_id] = (totals[movie_id] || 0) + score
      counts[movie_id] = (counts[movie_id] || 0) + 1
    })
    const avgs = {}
    Object.keys(totals).forEach(id => { avgs[id] = totals[id] / counts[id] })
    setAvgVotes(avgs)

    if (member) {
      const mine = {}
      allVotes.filter(v => v.member_id === member.id).forEach(v => { mine[v.movie_id] = v.score })
      setUserVotes(mine)
    }
    setLoading(false)
  }

  async function handleVote(movieId, score) {
    if (!memberId || voteSaving) return
    setVoteSaving(true)
    await supabase.from('votes').upsert(
      { movie_id: movieId, member_id: memberId, score, voted_at: new Date().toISOString() },
      { onConflict: 'movie_id,member_id' }
    )
    setUserVotes(v => ({ ...v, [movieId]: score }))
    setVoteSaving(false)
    // Reload avg
    const { data } = await supabase.from('votes').select('score').eq('movie_id', movieId)
    if (data?.length) {
      const avg = data.reduce((s, v) => s + v.score, 0) / data.length
      setAvgVotes(a => ({ ...a, [movieId]: avg }))
    }
  }

  async function searchTmdb() {
    if (!addQuery.trim()) return
    setAddSearching(true); setAddResults([]); setAddPicked(null)
    const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(addQuery)}`)
    setAddResults(await res.json())
    setAddSearching(false)
  }

  async function pickTmdb(result) {
    setAddPicked({ loading: true, title: result.title })
    const res = await fetch(`/api/tmdb/details?id=${result.id}`)
    setAddPicked(await res.json())
  }

  async function handleAddMovie() {
    if (!addPicked || addSaving) return
    setAddSaving(true); setAddError('')
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/movies/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify(addPicked),
    })
    const data = await res.json()
    if (!res.ok) { setAddError(data.error || 'Failed to add movie'); setAddSaving(false); return }
    await loadAll()
    setShowAdd(false); setAddQuery(''); setAddResults([]); setAddPicked(null); setAddSaving(false)
  }

  const filtered = movies.filter(m => !search || m.title.toLowerCase().includes(search.toLowerCase()))

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div style={{ padding: '1.25rem', paddingBottom: '5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700 }}>🎬 Movie Library</h1>
        {isAdmin && (
          <button onClick={() => setShowAdd(true)} style={{
            background: 'var(--teal)', color: '#fff', border: 'none',
            borderRadius: '8px', padding: '0.45rem 0.85rem',
            fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
          }}>+ Add Movie</button>
        )}
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search movies…"
        style={{
          width: '100%', padding: '0.75rem 1rem', marginBottom: '1rem',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '10px', color: 'var(--text)', fontSize: '0.9rem',
          boxSizing: 'border-box', outline: 'none',
        }} />

      {/* Count */}
      <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '0.75rem', textAlign: 'right' }}>
        {filtered.length} movie{filtered.length !== 1 ? 's' : ''}
      </p>

      {/* List */}
      {filtered.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '3rem 0', fontSize: '0.9rem' }}>
          {search ? 'No movies match your search.' : 'No movies yet.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {filtered.map(m => (
            <div key={m.id} onClick={() => setSelected(m)} style={{
              background: 'var(--surface)', borderRadius: '12px', padding: '0.75rem',
              border: '1px solid var(--border)', display: 'flex', gap: '0.75rem',
              alignItems: 'center', cursor: 'pointer',
            }}>
              {m.poster_url
                ? <img src={m.poster_url} alt={m.title} style={{ width: 44, height: 64, objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
                : <div style={{ width: 44, height: 64, borderRadius: '6px', background: 'var(--surface2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>🎬</div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '0.1rem' }}>
                  {[m.year, m.genre].filter(Boolean).join(' · ') || ''}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                  {m.rating_imdb && <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600 }}>⭐ {m.rating_imdb}</span>}
                  {avgVotes[m.id] && <span style={{ fontSize: '0.72rem', color: 'var(--teal)', fontWeight: 600 }}>★ {avgVotes[m.id].toFixed(1)}</span>}
                  {userVotes[m.id] && <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>you: {userVotes[m.id]}★</span>}
                  {m.we_own && <span style={{ fontSize: '0.68rem', background: 'var(--amber-light)', color: 'var(--amber-dark)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>📀 We own</span>}
                </div>
                {parseStreaming(m.streaming_au).length > 0 && (
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    📺 {parseStreaming(m.streaming_au).join(' · ')}
                  </div>
                )}
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: '1.1rem', flexShrink: 0 }}>›</span>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div style={OVERLAY} onClick={() => setSelected(null)}>
          <div style={SHEET} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, flex: 1, paddingRight: '1rem', lineHeight: 1.3 }}>{selected.title}</h2>
              <button onClick={() => setSelected(null)} style={{ background: 'var(--surface2)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              {selected.poster_url
                ? <img src={selected.poster_url} alt={selected.title} style={{ width: 90, height: 130, objectFit: 'cover', borderRadius: '10px', flexShrink: 0 }} />
                : <div style={{ width: 90, height: 130, borderRadius: '10px', background: 'var(--surface2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem' }}>🎬</div>
              }
              <div style={{ flex: 1 }}>
                {selected.year && <div style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>{selected.year}</div>}
                {selected.genre && <div style={{ color: 'var(--text-dim)', fontSize: '0.82rem', marginTop: '0.15rem' }}>{selected.genre}</div>}
                {selected.runtime && <div style={{ fontSize: '0.82rem', marginTop: '0.15rem' }}>⏱ {selected.runtime}</div>}
                {selected.director && <div style={{ fontSize: '0.82rem', marginTop: '0.3rem' }}><strong>Dir:</strong> {selected.director}</div>}
                {selected.actors && <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>{selected.actors}</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                  {selected.rating_imdb && <span style={{ fontWeight: 700, color: '#f59e0b', fontSize: '0.9rem' }}>⭐ {selected.rating_imdb}</span>}
                  {selected.imdb_id && (
                    <a href={`https://www.imdb.com/title/${selected.imdb_id}/`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '0.75rem', color: 'var(--teal)', textDecoration: 'none', fontWeight: 600 }}>IMDB ↗</a>
                  )}
                </div>
                {selected.we_own && <div style={{ fontSize: '0.78rem', color: 'var(--amber-dark)', fontWeight: 600, marginTop: '0.3rem' }}>📀 We own this one</div>}
              </div>
            </div>

            {selected.plot && (
              <p style={{ fontSize: '0.85rem', lineHeight: 1.55, color: 'var(--text)', marginBottom: '1rem' }}>{selected.plot}</p>
            )}

            {parseStreaming(selected.streaming_au).length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.8px', color: 'var(--text-dim)', marginBottom: '0.4rem' }}>STREAMING IN AU</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {parseStreaming(selected.streaming_au).map(s => (
                    <span key={s} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '3px 8px', fontSize: '0.75rem' }}>{s}</span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.8px', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>YOUR RATING</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Stars value={userVotes[selected.id] || 0} onChange={score => handleVote(selected.id, score)} size="1.6rem" />
                {userVotes[selected.id] && <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>{userVotes[selected.id]}/5</span>}
                {voteSaving && <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Saving…</span>}
              </div>
              {avgVotes[selected.id] && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                  Member average: ★ {avgVotes[selected.id].toFixed(1)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Movie modal (admin) */}
      {showAdd && (
        <div style={OVERLAY} onClick={() => setShowAdd(false)}>
          <div style={SHEET} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Add Movie</h2>
              <button onClick={() => { setShowAdd(false); setAddQuery(''); setAddResults([]); setAddPicked(null) }}
                style={{ background: 'var(--surface2)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input value={addQuery} onChange={e => setAddQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchTmdb()}
                placeholder="Search for a movie…"
                style={{ flex: 1, padding: '0.75rem 1rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text)', fontSize: '0.9rem', outline: 'none' }} />
              <button onClick={searchTmdb} disabled={addSearching} style={{
                background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '10px',
                padding: '0 1rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: addSearching ? 0.6 : 1,
              }}>{addSearching ? '…' : 'Search'}</button>
            </div>

            {/* Search results */}
            {!addPicked && addResults.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '45vh', overflowY: 'auto', marginBottom: '1rem' }}>
                {addResults.map(r => (
                  <div key={r.id} onClick={() => pickTmdb(r)} style={{
                    display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.6rem',
                    borderRadius: '10px', cursor: 'pointer', border: '1px solid var(--border)',
                    background: 'var(--surface)',
                  }}>
                    {r.poster_path
                      ? <img src={`https://image.tmdb.org/t/p/w92${r.poster_path}`} alt={r.title} style={{ width: 36, height: 52, objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />
                      : <div style={{ width: 36, height: 52, background: 'var(--surface2)', borderRadius: '4px', flexShrink: 0 }} />
                    }
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{r.title}</div>
                      <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{r.release_date?.split('-')[0] || '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Selected preview */}
            {addPicked && (
              <div style={{ background: 'var(--surface2)', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
                {addPicked.loading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}><div className="spinner" /></div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      {addPicked.poster_url && <img src={addPicked.poster_url} alt={addPicked.title} style={{ width: 60, height: 88, objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />}
                      <div>
                        <div style={{ fontWeight: 700 }}>{addPicked.title}</div>
                        <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{[addPicked.year, addPicked.genre].filter(Boolean).join(' · ')}</div>
                        {addPicked.director && <div style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>Dir: {addPicked.director}</div>}
                      </div>
                    </div>
                    {addPicked.plot && <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: 1.4, margin: 0 }}>{addPicked.plot.slice(0, 220)}{addPicked.plot.length > 220 ? '…' : ''}</p>}
                    <button onClick={() => setAddPicked(null)} style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: '0.78rem', cursor: 'pointer', padding: '0.5rem 0 0', textDecoration: 'underline' }}>← Back to results</button>
                  </>
                )}
              </div>
            )}

            {addError && <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{addError}</p>}

            <button onClick={handleAddMovie} disabled={!addPicked || addPicked.loading || addSaving} style={{
              width: '100%', padding: '0.9rem', background: 'var(--teal)', color: '#fff',
              border: 'none', borderRadius: '10px', fontSize: '0.95rem', fontWeight: 700,
              cursor: addPicked && !addPicked.loading && !addSaving ? 'pointer' : 'not-allowed',
              opacity: addPicked && !addPicked.loading && !addSaving ? 1 : 0.4,
            }}>{addSaving ? 'Adding…' : 'Add to Library'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
