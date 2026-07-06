'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { computeFreeCost } from '@/lib/freeCost'
import VoteScoreGrid from '@/components/VoteScoreGrid'
function parseGenres(g) {
  if (!g) return []
  return g.split(/[,|\/]/).map(x => x.trim()).filter(Boolean)
}


// ── Rapid-fire Rating Swiper ──────────────────────────────────────────────────
function RatingSwiper({ movies, memberId, onDone }) {
  const [idx, setIdx]         = useState(0)
  const [rated, setRated]     = useState(0)
  const [submitting, setSub]  = useState(false)
  const [ignored, setIgnored] = useState(new Set())
  const [allDone, setAllDone] = useState(false)

  const queue = movies.filter(m => !ignored.has(m.id))
  const movie  = queue[idx] || null
  const total  = queue.length
  const isLast = idx >= total - 1

  async function submitRating(score) {
    if (!movie || submitting) return
    setSub(true)
    await supabase.from('votes').upsert(
      { member_id: memberId, movie_id: movie.id, score },
      { onConflict: 'member_id,movie_id' }
    )
    setSub(false)
    setRated(r => r + 1)
    advance()
  }

  function skipOne() {
    setIgnored(prev => new Set([...prev, movie.id]))
    if (idx >= queue.length - 2) { setAllDone(true); onDone() }
  }

  function advance() {
    if (isLast) { setAllDone(true); onDone() }
    else setIdx(i => i + 1)
  }

  function skipAll() { setAllDone(true); onDone() }

  if (allDone || total === 0) {
    return (
      <div style={{ textAlign:'center', padding:'1.5rem 0' }}>
        <div style={{ fontSize:'2rem', marginBottom:'0.4rem' }}>🎉</div>
        <div style={{ fontWeight:700, marginBottom:'0.25rem' }}>
          {rated > 0 ? `${rated} film${rated !== 1 ? 's' : ''} rated!` : 'All caught up'}
        </div>
        <div style={{ fontSize:'0.82rem', color:'var(--text-dim)' }}>Browse the full list below</div>
      </div>
    )
  }

  const genres = parseGenres(movie.genre)

  return (
    <div style={{ marginBottom:'1rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:'0.75rem' }}>
        <div>
          <div style={{ fontWeight:700, fontSize:'0.95rem' }}>Rate a Film</div>
          <div style={{ fontSize:'0.75rem', color:'var(--text-dim)' }}>{idx + 1} of {total} unrated</div>
        </div>
        <button onClick={skipAll}
          style={{ background:'none', border:'1px solid var(--border)', color:'var(--text-dim)', borderRadius:'20px', padding:'0.25rem 0.65rem', fontSize:'0.72rem', fontWeight:600, cursor:'pointer' }}>
          Skip all
        </button>
      </div>

      <div style={{ height:3, background:'var(--surface2)', borderRadius:2, marginBottom:'1rem', overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${(idx / total) * 100}%`, background:'var(--teal)', borderRadius:2, transition:'width 0.3s ease' }} />
      </div>

      <div style={{ background:'var(--surface)', borderRadius:'16px', border:'1px solid var(--border)', overflow:'hidden', boxShadow:'var(--shadow)', marginBottom:'0.75rem' }}>
        <div style={{ display:'flex', minHeight:120 }}>
          {movie.poster_url
            ? <img src={movie.poster_url} alt={movie.title} style={{ width:90, objectFit:'cover', flexShrink:0 }} />
            : <div style={{ width:90, background:'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2rem', flexShrink:0 }}>🎬</div>}
          <div style={{ flex:1, padding:'0.9rem 1rem' }}>
            <div style={{ fontWeight:800, fontSize:'1rem', lineHeight:1.2, marginBottom:'0.25rem' }}>{movie.title}</div>
            {movie.year && <div style={{ fontSize:'0.78rem', color:'var(--text-dim)', marginBottom:'0.35rem' }}>{movie.year}{movie.runtime ? ` · ${movie.runtime}` : ''}</div>}
            {genres.length > 0 && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:'0.25rem' }}>
                {genres.slice(0, 3).map(g => (
                  <span key={g} style={{ background:'var(--surface2)', borderRadius:'20px', padding:'0.1rem 0.4rem', fontSize:'0.65rem', color:'var(--text-dim)' }}>{g}</span>
                ))}
              </div>
            )}
            {movie.rating_imdb && <div style={{ fontSize:'0.75rem', color:'var(--amber-dark)', fontWeight:600, marginTop:'0.3rem' }}>★ {movie.rating_imdb}</div>}
          </div>
        </div>
        <div style={{ padding:'0.75rem 0.85rem 0.85rem', borderTop:'1px solid var(--border)' }}>
          <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.5rem', textAlign:'center' }}>
            How keen are you to watch this?
          </div>
          <div style={{ marginBottom:'0.6rem' }}>
            <VoteScoreGrid onVote={submitRating} disabled={submitting} accentColor="var(--teal)" />
          </div>
          <button onClick={skipOne}
            style={{ width:'100%', padding:'0.5rem', background:'none', border:'1px solid var(--border)', borderRadius:'10px', fontSize:'0.8rem', fontWeight:600, color:'var(--text-dim)', cursor:'pointer' }}>
            Skip this one
          </button>
        </div>
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', gap:'0.5rem' }}>
        <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
          style={{ flex:1, padding:'0.5rem', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', fontSize:'0.8rem', fontWeight:600, color:idx===0?'var(--text-dim)':'var(--text)', cursor:idx===0?'not-allowed':'pointer', opacity:idx===0?0.4:1 }}>
          ‹ Prev
        </button>
        <button onClick={advance} disabled={isLast}
          style={{ flex:1, padding:'0.5rem', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', fontSize:'0.8rem', fontWeight:600, color:isLast?'var(--text-dim)':'var(--text)', cursor:isLast?'not-allowed':'pointer', opacity:isLast?0.4:1 }}>
          Next ›
        </button>
      </div>
    </div>
  )
}

function GenreChips({ genres, max = 4 }) {
  const [expanded, setExpanded] = useState(false)
  if (!genres || !genres.length) return null
  const needsTrunc = !expanded && genres.length > max
  const shown = needsTrunc ? genres.slice(0, max - 1) : genres
  const hidden = genres.length - (max - 1)
  const chipStyle = { background:'var(--surface2)', borderRadius:'20px', padding:'0.2rem 0.65rem', fontSize:'0.75rem', color:'var(--text-dim)', whiteSpace:'nowrap' }
  const moreStyle = { ...chipStyle, background:'transparent', border:'1px dashed var(--border)', opacity:0.65, cursor:'pointer' }
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem' }}>
      {shown.map(g => <span key={g} style={chipStyle}>{g}</span>)}
      {needsTrunc && <span style={moreStyle} onClick={() => setExpanded(true)}>+{hidden} more</span>}
    </div>
  )
}

function Toast({ toasts }) {
  return (
    <div style={{ position:'fixed', top:'1rem', left:'50%', transform:'translateX(-50%)', zIndex:999, display:'flex', flexDirection:'column', gap:'0.5rem', pointerEvents:'none', minWidth:260, maxWidth:'90vw' }}>
      {toasts.map(t => (
        <div key={t.id} style={{ background: t.type==='error'?'var(--danger)':'#15803d', color:'#fff', padding:'0.75rem 1.1rem', borderRadius:'12px', fontSize:'0.88rem', fontWeight:600, boxShadow:'0 4px 20px rgba(0,0,0,0.2)', display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <span>{t.type==='error'?'✕':'✓'}</span>{t.message}
        </div>
      ))}
    </div>
  )
}

function ConfirmDialog({ title, message, confirmLabel, confirmColor, onConfirm, onCancel }) {
  return (
    <div onClick={onCancel} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--surface)', borderRadius:'16px', padding:'1.5rem', width:'100%', maxWidth:320 }}>
        <div style={{ fontWeight:700, marginBottom:'0.5rem' }}>{title||'Are you sure?'}</div>
        <div style={{ fontSize:'0.88rem', color:'var(--text-dim)', marginBottom:'1.25rem', lineHeight:1.5 }}>{message}</div>
        <div style={{ display:'flex', gap:'0.75rem' }}>
          <button onClick={onCancel} style={{ flex:1, padding:'0.75rem', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'10px', fontSize:'0.9rem', fontWeight:600, cursor:'pointer', color:'var(--text)' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex:1, padding:'0.75rem', background:confirmColor||'var(--danger)', border:'none', borderRadius:'10px', fontSize:'0.9rem', fontWeight:600, cursor:'pointer', color:'#fff' }}>{confirmLabel||'Confirm'}</button>
        </div>
      </div>
    </div>
  )
}

function VoteGrid({ current, onVote, onRemove, loading }) {
  return (
    <div>
      <div style={{ fontSize:'0.8rem', fontWeight:600, color:'var(--text-dim)', marginBottom:'0.5rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>
        {current ? `Your rating: ${current}/10` : 'Rate this movie'}
      </div>
      <VoteScoreGrid current={current} onVote={onVote} disabled={loading} accentColor="var(--teal)" />
      {current && (
        <button onClick={onRemove} disabled={loading} style={{ marginTop:'0.75rem', background:'none', border:'none', color:'var(--text-dim)', fontSize:'0.8rem', cursor:'pointer', textDecoration:'underline' }}>
          Remove my rating
        </button>
      )}
    </div>
  )
}

function Overlay({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center', paddingBottom:'60px' }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:640 }}>{children}</div>
    </div>
  )
}

function SuggestOverlay({ children, onClose }) {
  // Previous approach computed a marginBottom "correction" from
  // window.innerHeight vs visualViewport.height/offsetTop. That's fragile —
  // on iPhone Safari, with the search input autofocused (keyboard opens the
  // instant this sheet mounts), the correction came out far too large and
  // pushed the whole sheet off the top of the screen instead of just above
  // the keyboard, confirmed live (screenshots + Iain: "its the keyboard
  // pushing the modal UP").
  //
  // Fixed properly this time: instead of nudging the child sheet by a
  // computed delta, make the CONTAINER itself exactly match the currently
  // visible region by reading visualViewport.offsetTop/height directly and
  // applying them as this div's own top/height. No arithmetic to get wrong —
  // whatever iOS reports as "currently visible" is exactly what this
  // container occupies, every time, and the sheet (pinned to its bottom via
  // alignItems:'flex-end') naturally lands just above the keyboard.
  const [vp, setVp] = React.useState(() => ({
    top: 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  }))

  // Lock body scroll while open — removes the scrollable ancestor iOS would
  // otherwise try to auto-scroll to reveal the focused input, which is a
  // second, independent source of the same "sheet jumps around" problem.
  React.useEffect(() => {
    const scrollY = window.scrollY
    const { style } = document.body
    const prev = { position: style.position, top: style.top, width: style.width }
    style.position = 'fixed'
    style.top = `-${scrollY}px`
    style.width = '100%'
    return () => {
      style.position = prev.position
      style.top = prev.top
      style.width = prev.width
      window.scrollTo(0, scrollY)
    }
  }, [])

  React.useEffect(() => {
    const vv = window.visualViewport
    function update() {
      if (vv) setVp({ top: vv.offsetTop, height: vv.height })
      else setVp({ top: 0, height: window.innerHeight })
    }
    update()
    if (!vv) return
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update) }
  }, [])

  // BottomNav sits fixed at the bottom of the app (60px) and the backdrop
  // reserves that much space below the sheet so it doesn't collide with it.
  // But once the keyboard is open, BottomNav is already covered by the OS
  // keyboard — that reserved 60px is then dead space taken from the sheet
  // for a nav bar the user can't see or reach anyway. window.innerHeight is
  // the stable layout-viewport height (doesn't shrink for the keyboard);
  // visualViewport.height does — so a real gap between them is a reliable
  // "keyboard is up" signal, not a guess.
  const fullHeight = typeof window !== 'undefined' ? window.innerHeight : vp.height
  const keyboardOpen = fullHeight - vp.height > 100
  const bottomPad = keyboardOpen ? 12 : 60

  // Concrete pixel cap for the sheet's own content, derived from the same
  // visualViewport measurement as the container above — not a vh/dvh guess.
  // Passed down so the sheet clamps to whatever space is actually visible
  // (keyboard up or not) instead of forcing a fixed vh floor that can be
  // taller than the real available space when the keyboard is open.
  const contentMaxHeight = Math.max(240, vp.height - bottomPad)
  const child = React.isValidElement(children)
    ? React.cloneElement(children, { maxHeight: contentMaxHeight })
    : children

  return (
    <div onClick={onClose} style={{ position:'fixed', top:vp.top, left:0, right:0, height:vp.height, background:'rgba(0,0,0,0.5)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center', paddingBottom:`${bottomPad}px` }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:640 }}>{child}</div>
    </div>
  )
}

function DetailSheet({ movie, myVote, avgData, memberId, isAdmin, session, onClose, onVoted, onDeleted, addToast, freeCostData }) {
  const [voting, setVoting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const genres = parseGenres(movie.genre)
  const imdbUrl = movie.imdb_id ? `https://www.imdb.com/title/${movie.imdb_id}/` : null

  async function handleVote(score) {
    setVoting(true)
    const { error } = await supabase.from('votes').upsert(
      { movie_id:movie.id, member_id:memberId, score, voted_at:new Date().toISOString() },
      { onConflict:'movie_id,member_id' }
    )
    setVoting(false)
    if (error) { addToast('Vote failed','error'); return }
    addToast(`Rated ${score}/10 for ${movie.title}`)
    onVoted()
  }
  async function handleRemove() {
    setVoting(true)
    await supabase.from('votes').delete().eq('movie_id',movie.id).eq('member_id',memberId)
    setVoting(false); addToast('Rating removed'); onVoted()
  }
  async function handleDelete() {
    setConfirmDelete(false); setDeleting(true)
    // DVDs (we_own=true) must only have the suggestion flag cleared — never hard-deleted from here
    const isDvd = movie.we_own
    const res = isDvd
      ? await fetch('/api/dvd/suggest', { method:'DELETE', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` }, body: JSON.stringify({ movie_id: movie.id }) })
      : await fetch(`/api/movies/${movie.id}`, { method:'DELETE', headers:{ 'Authorization':`Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` } })
    setDeleting(false)
    if (!res.ok) { const d=await res.json().catch(()=>({})); addToast(d.error||'Remove failed','error'); return }
    addToast(isDvd ? `${movie.title} removed from suggestions` : `${movie.title} removed`)
    onClose(); onDeleted()
  }

  return (
    <>
      <div style={{ background:'var(--surface)', borderRadius:'20px 20px 0 0', maxHeight:'calc(92vh - 60px)', overflowY:'auto' }}>
        {movie.poster_url && (
          <div style={{ position:'relative', height:180, overflow:'hidden', borderRadius:'20px 20px 0 0' }}>
            <img src={movie.poster_url} alt={movie.title} style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'top', filter:'blur(2px) brightness(0.6)', transform:'scale(1.05)' }} />
            <img src={movie.poster_url} alt={movie.title} style={{ position:'absolute', left:'1.25rem', bottom:'-40px', width:80, height:120, objectFit:'cover', borderRadius:8, boxShadow:'0 4px 16px rgba(0,0,0,0.4)' }} />
            <button onClick={onClose} style={{ position:'absolute', top:'0.75rem', right:'0.75rem', width:32, height:32, borderRadius:'50%', background:'rgba(0,0,0,0.5)', border:'none', color:'#fff', fontSize:'1.1rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>
        )}
        <div style={{ padding:movie.poster_url?'3rem 1.25rem 1.5rem':'1.5rem 1.25rem', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
          {!movie.poster_url && <div style={{ display:'flex', justifyContent:'flex-end' }}><button onClick={onClose} style={{ background:'none', border:'none', fontSize:'1.5rem', cursor:'pointer', color:'var(--text-dim)' }}>×</button></div>}
          <div>
            <div style={{ fontWeight:800, fontSize:'1.2rem', lineHeight:1.2 }}>
              {movie.title}{movie.rating && <span style={{ fontWeight: 400, fontSize: '0.75em', verticalAlign: 'baseline', color: 'var(--text-dim)' }}> ({movie.rating})</span>}
            </div>
            {movie.year && <div style={{ color:'var(--text-dim)', fontSize:'0.85rem', marginTop:'0.2rem' }}>{movie.year}{movie.runtime&&` · ${movie.runtime}`}</div>}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem', alignItems:'center' }}>
            <GenreChips genres={genres} />
            {isAdmin && freeCostData && (
              <span style={{ background:freeCostData.isFree?'#dcfce7':'#fef3c7', color:freeCostData.isFree?'#15803d':'#d97706', borderRadius:'20px', padding:'0.2rem 0.65rem', fontSize:'0.75rem', fontWeight:700 }}>
                ● {freeCostData.reasons[0] || (freeCostData.isFree ? 'Free' : 'Cost')}
              </span>
            )}
          </div>
          <div style={{ display:'flex', gap:'1.25rem', flexWrap:'wrap', alignItems:'flex-end' }}>
            {avgData?.count>0 && (
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:'1.4rem', fontWeight:800, color:'var(--teal)' }}>{avgData.avg.toFixed(1)}</div>
                <div style={{ fontSize:'0.7rem', color:'var(--text-dim)' }}>Community ({avgData.count})</div>
              </div>
            )}
            {movie.rating_imdb && (
              <div style={{ textAlign:'center' }}>
                {imdbUrl ? <a href={imdbUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize:'1.4rem', fontWeight:800, color:'var(--amber-dark)', textDecoration:'none' }}>★ {movie.rating_imdb}</a>
                  : <div style={{ fontSize:'1.4rem', fontWeight:800, color:'var(--amber-dark)' }}>★ {movie.rating_imdb}</div>}
                <div style={{ fontSize:'0.7rem', color:'var(--text-dim)' }}>IMDB</div>
              </div>
            )}
            {movie.rating_rt && (
              <div style={{ textAlign:'center' }}>
                <a href={`https://www.rottentomatoes.com/search?search=${encodeURIComponent(movie.title)}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:'1.4rem', fontWeight:800, color:'#fa320a', textDecoration:'none' }}>🍅 {movie.rating_rt}</a>
                <div style={{ fontSize:'0.7rem', color:'var(--text-dim)' }}>Rotten Tomatoes</div>
              </div>
            )}
          </div>
          {movie.director && <div style={{ fontSize:'0.85rem', color:'var(--text-dim)' }}><strong>Director:</strong> {movie.director}</div>}
          {movie.actors   && <div style={{ fontSize:'0.85rem', color:'var(--text-dim)' }}><strong>Cast:</strong> {movie.actors}</div>}
          {movie.plot     && <div style={{ fontSize:'0.88rem', lineHeight:1.6, color:'var(--text)' }}>{movie.plot}</div>}
          <div style={{ borderTop:'1px solid var(--border)', paddingTop:'0.75rem' }}>
            <VoteGrid current={myVote} onVote={handleVote} onRemove={handleRemove} loading={voting} />
          </div>
          {isAdmin && (
            <button onClick={()=>setConfirmDelete(true)} disabled={deleting}
              style={{ background:'none', border:'1px solid var(--danger)', borderRadius:'10px', color:'var(--danger)', fontSize:'0.82rem', fontWeight:600, padding:'0.55rem', cursor:deleting?'not-allowed':'pointer', width:'100%', opacity:deleting?0.5:1 }}>
              {deleting?'Removing…':'🗑 Remove from suggestions'}
            </button>
          )}
        </div>
      </div>
      {confirmDelete && <ConfirmDialog
        title={movie.we_own ? "Remove from suggestions?" : "Remove movie?"}
        message={movie.we_own ? `Remove "${movie.title}" from viewing suggestions? The DVD remains in the library.` : `Remove "${movie.title}" and all its ratings?`}
        confirmLabel="Remove" confirmColor="var(--danger)" onConfirm={handleDelete} onCancel={()=>setConfirmDelete(false)} />}
    </>
  )
}

function SuggestSheet({ session, onClose, onAdded, addToast, maxHeight }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  // Results only ever show after an explicit Search tap — no live-as-you-type
  // search. Sheet starts minimal (just the field) since vertical space here
  // is scarce. Once a search has run, the results stay visible from then on
  // — editing the field and searching again just updates them in place; we
  // don't collapse back to the minimal view on refocus anymore. That was
  // the previous approach and caused a real bug: collapsing the sheet's
  // height synchronously inside the focus handler, mid-tap, could shift the
  // layout enough that the tap's own click event landed on the backdrop
  // behind the now-shrunken sheet instead of the input — closing the whole
  // modal. Letting the native keyboard do the show/hide work instead (blur
  // on search, focus on tap) avoids that resize-during-gesture race
  // entirely: the sheet's own height only ever changes in response to the
  // visualViewport resize that the keyboard itself causes, never inside a
  // click/focus handler.
  const [resultsVisible, setResultsVisible] = useState(false)
  const [searchedQuery, setSearchedQuery] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const searchInputRef = React.useRef(null)

  async function runSearch() {
    const q = query.trim()
    if (q.length < 3) return
    // Drop the keyboard natively once a search runs — reveals the full
    // results view using the space the keyboard just gave back, matching
    // every other native search screen.
    searchInputRef.current?.blur()
    if (q === searchedQuery) { setResultsVisible(true); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}`)
      setResults(await res.json() || [])
    } catch { setResults([]) }
    setSearching(false)
    setSearchedQuery(q)
    setResultsVisible(true)
  }

  async function pickMovie(tmdbId) {
    setLoadingPreview(true)
    try {
      const res = await fetch(`/api/tmdb/details?id=${tmdbId}`)
      const data = await res.json()
      if (data.error) { addToast('Could not load movie details', 'error'); setLoadingPreview(false); return }
      setPreview(data)
    } catch { addToast('Could not load movie details', 'error') }
    setLoadingPreview(false)
  }

  async function handleAdd() {
    if (!preview) return
    setSaving(true)
    const { data: { session: freshSession } } = await supabase.auth.getSession()
    const token = freshSession?.access_token
    if (!token) { addToast('Session expired — please log in again', 'error'); setSaving(false); return }
    const res = await fetch('/api/movies/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(preview),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { addToast(data.error || 'Failed to add', 'error'); return }
    addToast(`${preview.title} added to suggestions!`)
    onAdded(); onClose()
  }

  const leadActor = preview?.actors?.split(',')[0]?.trim()

  return (
    <div style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', minHeight: 0, maxHeight: maxHeight ? `${maxHeight}px` : 'calc(90vh - 60px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.25rem 0.75rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {preview ? (
          <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', padding: 0 }}>← Back</button>
        ) : (
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Suggest a Movie</h2>
        )}
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-dim)', lineHeight: 1 }}>×</button>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '1rem 1.25rem 1.5rem' }}>
        {/* Search state */}
        {!preview && (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <input
                ref={searchInputRef}
                placeholder="Search by title…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runSearch() } }}
                autoFocus
                style={{ flex: 1, minWidth: 0, padding: '0.7rem 0.9rem', border: '1.5px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--surface2)', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
              <button onClick={runSearch} disabled={query.trim().length < 3 || searching}
                style={{ flexShrink: 0, padding: '0 1.1rem', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: (query.trim().length < 3 || searching) ? 'not-allowed' : 'pointer', opacity: (query.trim().length < 3 || searching) ? 0.5 : 1 }}>
                {searching
                  ? <span style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  : <>🔍 Search</>}
              </button>
            </div>

            {!resultsVisible && query.trim().length > 0 && query.trim().length < 3 && (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', textAlign: 'center', padding: '1rem 0' }}>Enter at least 3 characters…</div>
            )}

            {!resultsVisible && query.trim().length >= 3 && !searching && (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', textAlign: 'center', padding: '1rem 0' }}>Tap Search to find "{query.trim()}"</div>
            )}

            {loadingPreview && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <div className="spinner" />
              </div>
            )}

            {resultsVisible && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {results.map(r => (
                    <div key={r.tmdb_id} onClick={() => pickMovie(r.tmdb_id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.6rem 0.75rem', background: 'var(--surface2)', borderRadius: '12px', cursor: 'pointer', border: '1px solid var(--border)' }}>
                      {r.poster_url
                        ? <img src={r.poster_url} alt="" style={{ width: 42, height: 63, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                        : <div style={{ width: 42, height: 63, background: 'var(--border)', borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>🎬</div>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.2 }}>{r.title}</div>
                        {r.year && <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginTop: '0.15rem' }}>{r.year}</div>}
                      </div>
                      <span style={{ color: 'var(--teal)', fontSize: '1rem', flexShrink: 0 }}>›</span>
                    </div>
                  ))}
                </div>

                {results.length === 0 && !searching && (
                  <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem 0', fontSize: '0.88rem' }}>No results for "{searchedQuery}"</div>
                )}
              </>
            )}
          </>
        )}

        {/* Preview / confirm state */}
        {preview && (
          <div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              {preview.poster_url
                ? <img src={preview.poster_url} alt="" style={{ width: 90, height: 135, objectFit: 'cover', borderRadius: 10, flexShrink: 0, boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }} />
                : <div style={{ width: 90, height: 135, background: 'var(--surface2)', borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>🎬</div>}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.2, marginBottom: '0.3rem' }}>{preview.title}</div>
                {leadActor && (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>
                    {leadActor}{preview.rating ? ` (${preview.rating})` : ''}
                  </div>
                )}
                {preview.year && <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>{preview.year}{preview.runtime ? ` · ${preview.runtime}` : ''}</div>}
                {preview.genre && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.4rem' }}>
                    {preview.genre.split(',').map(g => g.trim()).filter(Boolean).map(g => (
                      <span key={g} style={{ background: 'var(--surface2)', borderRadius: '20px', padding: '0.12rem 0.45rem', fontSize: '0.68rem', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>{g}</span>
                    ))}
                  </div>
                )}
                {preview.rating_imdb && (
                  <div style={{ marginTop: '0.4rem' }}>
                    <span style={{ background: 'rgba(180,150,0,0.15)', color: 'var(--amber-dark)', fontWeight: 700, fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: '20px', border: '1px solid rgba(180,150,0,0.3)' }}>IMDb {preview.rating_imdb}</span>
                  </div>
                )}
              </div>
            </div>

            {preview.plot && (
              <div style={{ fontSize: '0.83rem', color: 'var(--text-dim)', lineHeight: 1.55, marginBottom: '1.25rem', padding: '0.75rem', background: 'var(--surface2)', borderRadius: '10px' }}>
                {preview.plot}
              </div>
            )}

            <button onClick={handleAdd} disabled={saving}
              style={{ width: '100%', padding: '0.9rem', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Adding…' : `+ Add "${preview.title}" to Suggestions`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function MovieCard({ movie, myVote, avgData, isAdmin, freeCostData, onClick }) {
  const genres = parseGenres(movie.genre)
  const leadActor = movie.actors?.split(',')[0]?.trim()
  return (
    <div onClick={onClick} style={{ background:'var(--surface)', borderRadius:'12px', border:'1px solid var(--border)', borderLeft:'3px solid var(--teal)', display:'flex', overflow:'hidden', boxShadow:'var(--shadow)', cursor:'pointer' }}>
      {movie.poster_url
        ? <img src={movie.poster_url} alt={movie.title} style={{ width:65, objectFit:'cover', flexShrink:0 }} />
        : <div style={{ width:65, background:'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.5rem', flexShrink:0 }}>🎬</div>}
      <div style={{ flex:1, padding:'0.55rem 0.65rem', overflow:'hidden' }}>
        <div style={{ fontWeight:700, fontSize:'0.88rem', lineHeight:1.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {movie.title}{movie.rating && <span style={{ fontWeight: 400, fontSize: '0.75em', verticalAlign: 'baseline', color: 'var(--text-dim)' }}> ({movie.rating})</span>}
        </div>
        {leadActor && (
          <div style={{ color:'var(--text-dim)', fontSize:'0.72rem', marginTop:'0.1rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {leadActor}
          </div>
        )}
        {genres.length>0 && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:'0.2rem', marginTop:'0.25rem' }}>
            {genres.slice(0,2).map(g=><span key={g} style={{ background:'var(--surface2)', borderRadius:'20px', padding:'0.1rem 0.4rem', fontSize:'0.65rem', color:'var(--text-dim)' }}>{g}</span>)}
          </div>
        )}
        {isAdmin && freeCostData && (
          <div style={{ marginTop:'0.2rem' }}>
            <span style={{ background:freeCostData.isFree?'#dcfce7':'#fef3c7', color:freeCostData.isFree?'#15803d':'#d97706', borderRadius:'20px', padding:'0.1rem 0.45rem', fontSize:'0.62rem', fontWeight:700 }}>
              ● {freeCostData.reasons[0] || (freeCostData.isFree ? 'Free' : 'Cost')}
            </span>
          </div>
        )}
      </div>
      <div style={{ padding:'0.55rem 0.75rem', display:'flex', flexDirection:'column', alignItems:'flex-end', justifyContent:'center', gap:'0.2rem', flexShrink:0, minWidth:68 }}>
        {avgData?.count>0 ? (
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}>
            <span style={{ fontSize:'0.55rem', fontWeight:700, color:'var(--teal)', lineHeight:1, paddingTop:'0.1rem' }}>({avgData.count})</span>
            <span style={{ fontSize:'1.25rem', fontWeight:800, color:'var(--teal)', lineHeight:1 }}>{avgData.avg.toFixed(1)}</span>
          </div>
        ) : <div style={{ fontSize:'0.65rem', color:'var(--text-dim)', textAlign:'right' }}>Not yet<br/>rated</div>}
        {myVote && <div style={{ fontSize:'0.68rem', color:'var(--teal)', fontWeight:700 }}>you: {myVote}</div>}
        <div style={{ display:'flex', gap:'0.3rem', alignItems:'center' }}>
          {movie.rating_imdb && (movie.imdb_id
            ? <a href={`https://www.imdb.com/title/${movie.imdb_id}/`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{ fontSize:'0.65rem', color:'var(--amber-dark)', fontWeight:600, textDecoration:'none' }}>★ {movie.rating_imdb}</a>
            : <span style={{ fontSize:'0.65rem', color:'var(--amber-dark)', fontWeight:600 }}>★ {movie.rating_imdb}</span>)}
          {movie.rating_rt && <a href={`https://www.rottentomatoes.com/search?search=${encodeURIComponent(movie.title)}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{ fontSize:'0.65rem', color:'#fa320a', fontWeight:600, textDecoration:'none' }}>🍅 {movie.rating_rt}</a>}
        </div>
      </div>
    </div>
  )
}

export default function LibraryPage() {
  const [movies,  setMovies]  = useState([])
  const [votes,   setVotes]   = useState([])
  const [member,  setMember]  = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search,      setSearch]      = useState('')
  const [sortBy,      setSortBy]      = useState('community')
  const [genreFilter, setGenreFilter] = useState('all')
  const [filterExpanded, setFilterExpanded] = useState(false)
  const [selectedId,  setSelectedId]  = useState(null)
  const [showSuggest, setShowSuggest] = useState(false)
  const [swiperDone, setSwiperDone] = useState(false)
  const [showSwiper, setShowSwiper] = useState(false)
  const [toasts, setToasts] = useState([])
  const [introExpanded, setIntroExpanded] = useState(false)
  const [screenedMovies, setScreenedMovies] = useState([])
  const [screenedExpanded, setScreenedExpanded] = useState(false)
  const [streamingServices, setStreamingServices] = useState([])
  const [dvdTmdbIds,        setDvdTmdbIds]        = useState(new Set())
  const [dvdImdbIds,        setDvdImdbIds]        = useState(new Set())
  const [ownershipRecords,  setOwnershipRecords]  = useState([])

  function addToast(message, type='success') {
    const id = Date.now()
    setToasts(prev=>[...prev,{id,message,type}])
    setTimeout(()=>setToasts(prev=>prev.filter(t=>t.id!==id)),4000)
  }

  const loadData = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0]
    const [{ data: moviesData }, { data: votesData }, { data: futureEventsData }, { data: pastEventsData }, { data: dvdData }, settingsRes, { data: ownData }] = await Promise.all([
      supabase.from('movies').select('*').order('title'),
      supabase.from('votes').select('movie_id, member_id, score'),
      supabase.from('events').select('movie_id').gte('event_date', today).not('movie_id', 'is', null),
      supabase.from('events').select('movie_id').lt('event_date', today).not('movie_id', 'is', null),
      supabase.from('movies').select('tmdb_id, imdb_id').eq('we_own', true),
      supabase.from('settings').select('value').eq('key', 'our_streaming_services').single(),
      supabase.from('movie_ownership').select('movie_id, ownership_type, members(name)'),
    ])
    const scheduledMovieIds = new Set((futureEventsData||[]).map(e => e.movie_id))
    // Movies with only past events (not also scheduled for the future) go to screened bucket
    const pastMovieIds = new Set((pastEventsData||[]).map(e => e.movie_id))
    const onlyScreenedIds = new Set([...pastMovieIds].filter(id => !scheduledMovieIds.has(id)))
    const allVisible = (moviesData||[]).filter(m => m.is_viewing_suggestion || scheduledMovieIds.has(m.id) || onlyScreenedIds.has(m.id))
    setMovies(allVisible.filter(m => !onlyScreenedIds.has(m.id)))
    setScreenedMovies(allVisible.filter(m => onlyScreenedIds.has(m.id)))
    setVotes(votesData||[])
    // Store FREE/COST supporting data
    const dvds = dvdData || []
    setDvdTmdbIds(new Set(dvds.map(d => d.tmdb_id).filter(Boolean)))
    setDvdImdbIds(new Set(dvds.map(d => d.imdb_id).filter(Boolean)))
    try { setStreamingServices(JSON.parse(settingsRes.data?.value || '[]')) } catch { setStreamingServices([]) }
    setOwnershipRecords((ownData||[]).map(o => ({ movie_id: o.movie_id, ownership_type: o.ownership_type, member_name: o.members?.name || null })))
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data:{ session:s } }) => {
      setSession(s)
      if (s) supabase.from('members').select('id, is_admin').eq('auth_id',s.user.id).single().then(({data})=>setMember(data))
    })
    loadData()
  }, [loadData])

  const myVotes = Object.fromEntries(votes.filter(v=>v.member_id===member?.id).map(v=>[v.movie_id,v.score]))
  const unvoted = movies.filter(m => !myVotes[m.id])
  const avgVotes = movies.reduce((acc,m) => {
    const mv = votes.filter(v=>v.movie_id===m.id)
    if (mv.length>0) acc[m.id] = { avg: mv.reduce((s,v)=>s+v.score,0)/mv.length, count:mv.length }
    return acc
  }, {})
  const allGenres = [...new Set(movies.flatMap(m=>parseGenres(m.genre)))].sort()

  const filtered = movies.filter(m => {
    const matchSearch = !search || m.title.toLowerCase().includes(search.toLowerCase()) || (m.actors||'').toLowerCase().includes(search.toLowerCase())
    let matchGenre = true
    if (genreFilter==='unscored') matchGenre = !myVotes[m.id]
    else if (genreFilter==='free') matchGenre = computeFreeCost(m, { streamingServices, dvdTmdbIds, dvdImdbIds, ownershipRecords: ownershipRecords.filter(o => o.movie_id === m.id) }).isFree
    else if (genreFilter!=='all') matchGenre = parseGenres(m.genre).includes(genreFilter)
    return matchSearch && matchGenre
  })
  const sorted = [...filtered].sort((a,b) => {
    if (sortBy==='community') { const d=(avgVotes[b.id]?.avg||0)-(avgVotes[a.id]?.avg||0); return d!==0?d:(parseFloat(b.rating_imdb)||0)-(parseFloat(a.rating_imdb)||0) }
    if (sortBy==='imdb') return (parseFloat(b.rating_imdb)||0)-(parseFloat(a.rating_imdb)||0)
    return a.title.localeCompare(b.title)
  })

  const selectedMovie = selectedId ? movies.find(m=>m.id===selectedId) : null

  return (
    <div style={{ background:'var(--bg)', minHeight:'100vh' }}>
      <Toast toasts={toasts} />
      <div style={{ padding:'1rem 1rem 6rem' }}>
        <div style={{ background:'var(--surface)', borderRadius:'14px', padding:'0.75rem 1rem', marginBottom:'1rem', border:'1px solid var(--border)', borderLeft:'4px solid var(--teal)', fontSize:'0.88rem', lineHeight:1.5 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.6rem' }}>
            <span style={{ fontSize:'1.2rem', flexShrink:0 }}>🗳️</span>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, color:'var(--teal)', fontSize:'0.78rem', textTransform:'uppercase', letterSpacing:'0.06em' }}>VIEWING SUGGESTIONS</div>
              {introExpanded ? (
                <>
                  <div style={{ fontSize:'0.83rem', color:'var(--text-dim)', marginTop:'0.25rem' }}>
                    Films suggested by residents for future screenings. <strong>Score each movie to have your say</strong> — the higher the community vote, the more likely it is to make the big screen!
                  </div>
                  <button onClick={()=>setIntroExpanded(false)} style={{ background:'none', border:'none', color:'var(--teal)', fontSize:'0.75rem', fontWeight:600, cursor:'pointer', padding:'0.2rem 0', marginTop:'0.1rem' }}>Show less ↑</button>
                </>
              ) : (
                <button onClick={()=>setIntroExpanded(true)} style={{ background:'none', border:'none', color:'var(--teal)', fontSize:'0.75rem', fontWeight:600, cursor:'pointer', padding:'0.2rem 0' }}>Read more ↓</button>
              )}
            </div>
          </div>
        </div>

        <div style={{ position:'relative', marginBottom:'1rem' }}>
          <span style={{ position:'absolute', left:'0.85rem', top:'50%', transform:'translateY(-50%)', color:'var(--text-dim)' }}>🔍</span>
          <input placeholder="Search movies…" value={search} onChange={e=>setSearch(e.target.value)}
            style={{ width:'100%', padding:'0.7rem 0.85rem 0.7rem 2.4rem', border:'1.5px solid var(--border)', borderRadius:'12px', fontSize:'1rem', background:'var(--surface)', boxSizing:'border-box', fontFamily:'inherit' }} />
        </div>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
          <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--teal)', letterSpacing:'0.08em', textTransform:'uppercase' }}>
            ✦ {sorted.length} film{sorted.length!==1?'s':''} — tap to view &amp; vote
          </div>
          <div style={{ display:'flex', gap:'0.45rem', alignItems:'center' }}>
            {!swiperDone && unvoted.length > 0 && member?.id && (
              <button onClick={()=>setShowSwiper(true)} style={{ background:'var(--surface)', border:'1.5px solid var(--teal)', color:'var(--teal)', borderRadius:'20px', padding:'0.35rem 0.7rem', fontSize:'0.76rem', fontWeight:700, cursor:'pointer' }}>
                ⚡ Rate ({unvoted.length})
              </button>
            )}
            <button onClick={()=>setShowSuggest(true)} style={{ background:'var(--teal)', color:'#fff', border:'none', borderRadius:'20px', padding:'0.4rem 0.9rem', fontSize:'0.8rem', fontWeight:700, cursor:'pointer' }}>
              + Suggest
            </button>
          </div>
        </div>

        <div style={{ display:'flex', gap:'0.4rem', marginBottom:'0.85rem' }}>
          {[['community','Community'],['imdb','IMDB'],['az','A–Z']].map(([k,l])=>(
            <button key={k} onClick={()=>setSortBy(k)}
              style={{ flex:1, padding:'0.5rem 0', borderRadius:'10px', border:'1.5px solid', borderColor:sortBy===k?'var(--teal)':'var(--border)', background:sortBy===k?'var(--teal)':'var(--surface)', color:sortBy===k?'#fff':'var(--text)', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}>
              {l}
            </button>
          ))}
        </div>

        {(() => {
          const FIXED = [['all','All'],['free','Free'],['unscored','Unscored']]
          const VISIBLE = 6
          const btnStyle = (active) => ({ padding:'0.3rem 0.75rem', borderRadius:'20px', border:'1.5px solid', borderColor:active?'var(--teal)':'var(--border)', background:active?'var(--teal)':'transparent', color:active?'#fff':'var(--text)', fontSize:'0.78rem', fontWeight:active?700:400, cursor:'pointer' })
          const moreStyle = { padding:'0.3rem 0.75rem', borderRadius:'20px', border:'1.5px dashed var(--border)', background:'transparent', color:'var(--text-dim)', fontSize:'0.78rem', fontWeight:400, cursor:'pointer', opacity:0.7 }
          const needsCollapse = !filterExpanded && allGenres.length > VISIBLE
          const shownGenres = needsCollapse ? allGenres.slice(0, VISIBLE - 1) : allGenres
          const hidden = allGenres.length - (VISIBLE - 1)
          const selectedHidden = needsCollapse && !['all','unscored'].includes(genreFilter) && !shownGenres.includes(genreFilter)
          return (
            <div style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem', marginBottom:'1rem' }}>
              {FIXED.map(([k,l]) => <button key={k} onClick={()=>setGenreFilter(k)} style={btnStyle(genreFilter===k)}>{l}</button>)}
              {shownGenres.map(g => <button key={g} onClick={()=>setGenreFilter(g)} style={btnStyle(genreFilter===g)}>{g}</button>)}
              {selectedHidden && <button onClick={()=>setGenreFilter('all')} style={btnStyle(true)}>{genreFilter}</button>}
              {needsCollapse && <button onClick={()=>setFilterExpanded(true)} style={moreStyle}>+{hidden} more</button>}
              {filterExpanded && allGenres.length > VISIBLE && <button onClick={()=>setFilterExpanded(false)} style={moreStyle}>Show less</button>}
            </div>
          )
        })()}

        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:'3rem' }}><div className="spinner" /></div>
        ) : sorted.length===0 ? (
          <div style={{ textAlign:'center', color:'var(--text-dim)', padding:'3rem', fontSize:'0.9rem' }}>No movies match your filter.</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.65rem' }}>
            {sorted.map(m=>(
              <MovieCard key={m.id} movie={m} myVote={myVotes[m.id]} avgData={avgVotes[m.id]} isAdmin={member?.is_admin} freeCostData={member?.is_admin ? computeFreeCost(m, { streamingServices, dvdTmdbIds, dvdImdbIds, ownershipRecords: ownershipRecords.filter(o => o.movie_id === m.id) }) : null} onClick={()=>setSelectedId(m.id)} />
            ))}
          </div>
        )}

        {screenedMovies.length > 0 && (
          <div style={{ marginTop: '1.5rem' }}>
            <button
              onClick={() => setScreenedExpanded(e => !e)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10,
                padding: '0.65rem 1rem', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Previously Screened ({screenedMovies.length})
              </span>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{screenedExpanded ? '▲' : '▼'}</span>
            </button>
            {screenedExpanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.65rem' }}>
                {screenedMovies.map(m => (
                  <MovieCard key={m.id} movie={m} myVote={myVotes[m.id]} avgData={avgVotes[m.id]} isAdmin={member?.is_admin} freeCostData={member?.is_admin ? computeFreeCost(m, { streamingServices, dvdTmdbIds, dvdImdbIds, ownershipRecords: ownershipRecords.filter(o => o.movie_id === m.id) }) : null} onClick={()=>setSelectedId(m.id)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedMovie && (
        <Overlay onClose={()=>setSelectedId(null)}>
          <DetailSheet
            movie={selectedMovie}
            myVote={myVotes[selectedMovie.id]}
            avgData={avgVotes[selectedMovie.id]}
            memberId={member?.id}
            isAdmin={member?.is_admin}
            session={session}
            onClose={()=>setSelectedId(null)}
            onVoted={loadData}
            onDeleted={()=>{ setSelectedId(null); loadData() }}
            addToast={addToast}
            freeCostData={computeFreeCost(selectedMovie, {
              streamingServices,
              dvdTmdbIds,
              dvdImdbIds,
              ownershipRecords: ownershipRecords.filter(o => o.movie_id === selectedMovie.id),
            })}
          />
        </Overlay>
      )}
      {showSwiper && (
        <div onClick={()=>setShowSwiper(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center', paddingBottom:'60px' }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:640, background:'var(--surface)', borderRadius:'20px 20px 0 0', padding:'1.25rem', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem' }}>
              <div style={{ fontWeight:700, fontSize:'0.95rem' }}>Rate Films</div>
              <button onClick={()=>setShowSwiper(false)} style={{ background:'none', border:'none', fontSize:'1.3rem', cursor:'pointer', color:'var(--text-dim)', lineHeight:1 }}>✕</button>
            </div>
            <RatingSwiper movies={unvoted} memberId={member.id} onDone={()=>{ setSwiperDone(true); setShowSwiper(false) }} />
          </div>
        </div>
      )}
      {showSuggest && (
        <SuggestOverlay onClose={()=>setShowSuggest(false)}>
          <SuggestSheet session={session} onClose={()=>setShowSuggest(false)} onAdded={loadData} addToast={addToast} />
        </SuggestOverlay>
      )}
    </div>
  )
}

