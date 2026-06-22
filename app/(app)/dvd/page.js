'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

function parseGenres(g) {
  if (!g) return []
  return g.split(/[,|\/]/).map(x => x.trim()).filter(Boolean)
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
        <div key={t.id} style={{ background:t.type==='error'?'var(--danger)':'#15803d', color:'#fff', padding:'0.75rem 1.1rem', borderRadius:'12px', fontSize:'0.88rem', fontWeight:600, boxShadow:'0 4px 20px rgba(0,0,0,0.2)', display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <span>{t.type==='error'?'✕':'✓'}</span>{t.message}
        </div>
      ))}
    </div>
  )
}

function fmtDate(str) {
  if (!str) return ''
  return new Date(str).toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' })
}

// ── My Loans slide-out ────────────────────────────────────────────────────────
function MyLoansSheet({ myLoans, movies, onReturn, onClose, addToast }) {
  const [returning, setReturning] = useState(null)

  async function handleReturn(loan) {
    setReturning(loan.id)
    const { error } = await supabase.from('dvd_loans').update({ returned_at: new Date().toISOString() }).eq('id', loan.id)
    setReturning(null)
    if (error) { addToast('Could not return — ' + error.message, 'error'); return }
    const movie = movies.find(m => m.id === loan.movie_id)
    addToast((movie?.title || 'DVD') + ' returned — thanks!')
    onReturn()
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:640, background:'var(--surface)', borderRadius:'20px 20px 0 0', maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
        {/* Header */}
        <div style={{ padding:'0.6rem 1.25rem 0', display:'flex', justifyContent:'center' }}>
          <div style={{ width:40, height:4, background:'var(--border)', borderRadius:2 }} />
        </div>
        <div style={{ padding:'0.75rem 1.25rem 0.75rem', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ fontWeight:700, fontSize:'1rem' }}>📀 My Borrowed DVDs</div>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:'50%', background:'var(--surface2)', border:'none', fontSize:'1.1rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-dim)' }}>✕</button>
        </div>
        {/* List */}
        <div style={{ overflowY:'auto', flex:1, padding:'0.75rem 1.25rem 2rem' }}>
          {myLoans.length === 0 ? (
            <div style={{ textAlign:'center', color:'var(--text-dim)', padding:'2rem', fontSize:'0.9rem' }}>No DVDs on loan</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
              {myLoans.map(loan => {
                const movie = movies.find(m => m.id === loan.movie_id)
                if (!movie) return null
                return (
                  <div key={loan.id} style={{ display:'flex', alignItems:'center', gap:'0.75rem', background:'var(--surface2)', borderRadius:'12px', padding:'0.75rem', border:'1px solid var(--border)' }}>
                    {movie.poster_url
                      ? <img src={movie.poster_url} alt={movie.title} style={{ width:46, height:68, objectFit:'cover', borderRadius:6, flexShrink:0 }} />
                      : <div style={{ width:46, height:68, background:'var(--surface)', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.4rem', flexShrink:0 }}>💿</div>}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:'0.92rem', lineHeight:1.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{movie.title}</div>
                      <div style={{ fontSize:'0.75rem', color:'var(--text-dim)', marginTop:'0.2rem' }}>Borrowed {fmtDate(loan.borrowed_at)}</div>
                    </div>
                    <button onClick={() => handleReturn(loan)} disabled={returning === loan.id}
                      style={{ flexShrink:0, background:'var(--teal)', color:'#fff', border:'none', borderRadius:'10px', padding:'0.55rem 1rem', fontSize:'0.82rem', fontWeight:700, cursor:returning===loan.id?'not-allowed':'pointer', opacity:returning===loan.id?0.6:1, whiteSpace:'nowrap' }}>
                      {returning === loan.id ? '…' : 'Return'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── DVD Detail sheet ──────────────────────────────────────────────────────────
function DvdDetailSheet({ movie, isAdmin, session, memberId, myLoanCount, activeLoan, onClose, onDeleted, onLoansChanged, addToast }) {
  const [deleting,      setDeleting]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [borrowing,     setBorrowing]     = useState(false)
  const [returning,     setReturning]     = useState(false)
  const genres  = parseGenres(movie.genre)
  const imdbUrl = movie.imdb_id ? 'https://www.imdb.com/title/' + movie.imdb_id + '/' : null

  const iMineToReturn = activeLoan && activeLoan.member_id === memberId
  const onLoanByOther = activeLoan && activeLoan.member_id !== memberId
  const canBorrow     = !activeLoan && myLoanCount < 3

  async function handleBorrow() {
    if (!memberId) { addToast('Sign in to borrow DVDs', 'error'); return }
    setBorrowing(true)
    const { error } = await supabase.from('dvd_loans').insert({ movie_id: movie.id, member_id: memberId })
    setBorrowing(false)
    if (error) { addToast('Could not borrow — ' + error.message, 'error'); return }
    addToast('Borrowed! Enjoy ' + movie.title)
    onLoansChanged()
  }

  async function handleReturn() {
    setReturning(true)
    const { error } = await supabase.from('dvd_loans').update({ returned_at: new Date().toISOString() }).eq('id', activeLoan.id)
    setReturning(false)
    if (error) { addToast('Could not return — ' + error.message, 'error'); return }
    addToast(movie.title + ' returned — thanks!')
    onLoansChanged()
  }

  async function handleDelete() {
    setConfirmDelete(false); setDeleting(true)
    const res = await fetch('/api/movies/' + movie.id, { method:'DELETE', headers:{ 'Authorization':'Bearer ' + session?.access_token } })
    setDeleting(false)
    if (!res.ok) { const d=await res.json().catch(()=>({})); addToast(d.error||'Delete failed','error'); return }
    addToast(movie.title + ' removed'); onClose(); onDeleted()
  }

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
        <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:640, background:'var(--surface)', borderRadius:'20px 20px 0 0', maxHeight:'92vh', display:'flex', flexDirection:'column' }}>

          {/* ── Sticky header — always visible ── */}
          <div style={{ flexShrink:0 }}>
            {/* Drag handle */}
            <div style={{ padding:'0.6rem 1.25rem 0', display:'flex', justifyContent:'center' }}>
              <div style={{ width:40, height:4, background:'var(--border)', borderRadius:2 }} />
            </div>
            {/* Title bar with close */}
            <div style={{ padding:'0.6rem 1.25rem 0.6rem', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--border)' }}>
              <div style={{ fontWeight:800, fontSize:'1rem', lineHeight:1.2, flex:1, marginRight:'0.75rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{movie.title}</div>
              <button onClick={onClose} style={{ flexShrink:0, width:34, height:34, borderRadius:'50%', background:'var(--surface2)', border:'1px solid var(--border)', fontSize:'1rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-dim)', fontWeight:700 }}>✕</button>
            </div>
          </div>

          {/* ── Scrollable body ── */}
          <div style={{ overflowY:'auto', flex:1 }}>
            {movie.poster_url && (
              <div style={{ position:'relative', height:180, overflow:'hidden' }}>
                <img src={movie.poster_url} alt={movie.title} style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'top', filter:'blur(2px) brightness(0.6)', transform:'scale(1.05)' }} />
                <img src={movie.poster_url} alt={movie.title} style={{ position:'absolute', left:'1.25rem', bottom:'-40px', width:80, height:120, objectFit:'cover', borderRadius:8, boxShadow:'0 4px 16px rgba(0,0,0,0.4)' }} />

              </div>
            )}

            <div style={{ position:'relative', padding:movie.poster_url?'3rem 1.25rem 2.5rem':'1.25rem 1.25rem 2.5rem', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
              {/* Top-right column — ON LOAN pill + admin delete */}
              {(activeLoan || isAdmin) && (
                <div style={{ position:'absolute', top:'0.75rem', right:'1.25rem', display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'0.4rem' }}>
                  {activeLoan && (
                    <div style={{ background:iMineToReturn?'var(--teal)':'var(--surface2)', border:'1px solid ' + (iMineToReturn?'var(--teal)':'var(--border)'), borderRadius:'10px', padding:'0.4rem 0.65rem', textAlign:'center' }}>
                      <div style={{ fontSize:'0.65rem', fontWeight:800, color:iMineToReturn?'#fff':'var(--text)', textTransform:'uppercase', letterSpacing:'0.05em', lineHeight:1.2 }}>
                        📀 On Loan
                      </div>
                      <div style={{ fontSize:'0.6rem', color:iMineToReturn?'rgba(255,255,255,0.85)':'var(--text-dim)', marginTop:'0.2rem', lineHeight:1.3, whiteSpace:'nowrap' }}>
                        {iMineToReturn ? `You · ${fmtDate(activeLoan.borrowed_at)}` : `${activeLoan.members?.name || 'Resident'} · ${fmtDate(activeLoan.borrowed_at)}`}
                      </div>
                    </div>
                  )}
                  {isAdmin && (
                    <button onClick={() => setConfirmDelete(true)} disabled={deleting}
                      style={{ display:'flex', alignItems:'center', gap:'0.3rem', background:'none', border:'1px solid var(--danger)', borderRadius:'8px', padding:'0.3rem 0.6rem', fontSize:'0.68rem', fontWeight:700, color:'var(--danger)', cursor:deleting?'not-allowed':'pointer', opacity:deleting?0.5:1, whiteSpace:'nowrap' }}>
                      🗑 {deleting ? 'Removing…' : 'Remove'}
                    </button>
                  )}
                </div>
              )}
              {/* No-poster loan tile */}
              {!movie.poster_url && activeLoan && (
                <div style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem', background:iMineToReturn?'var(--teal)':'var(--surface2)', borderRadius:'10px', padding:'0.5rem 0.85rem', alignSelf:'flex-start', border:'1px solid ' + (iMineToReturn?'var(--teal)':'var(--border)') }}>
                  <span style={{ fontSize:'1rem' }}>{iMineToReturn?'📀':'📤'}</span>
                  <div>
                    <div style={{ fontSize:'0.72rem', fontWeight:800, color:iMineToReturn?'#fff':'var(--text)', textTransform:'uppercase', letterSpacing:'0.04em' }}>On Loan</div>
                    <div style={{ fontSize:'0.68rem', color:iMineToReturn?'rgba(255,255,255,0.85)':'var(--text-dim)' }}>
                      {iMineToReturn ? 'You · ' + fmtDate(activeLoan.borrowed_at) : (activeLoan.members?.name || 'Resident') + ' · ' + fmtDate(activeLoan.borrowed_at)}
                    </div>
                  </div>
                </div>
              )}

              {movie.year && <div style={{ color:'var(--text-dim)', fontSize:'0.85rem' }}>{movie.year}{movie.runtime ? ' · ' + movie.runtime : ''}</div>}

              {genres.length > 0 && <GenreChips genres={genres} />}

              <div style={{ display:'flex', gap:'0.75rem', alignItems:'center', flexWrap:'wrap' }}>
                {movie.rating && (
                  <span style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'6px', padding:'0.2rem 0.5rem', fontSize:'0.78rem', fontWeight:700, color:'var(--text-dim)', letterSpacing:'0.04em' }}>{movie.rating}</span>
                )}
                {movie.rating_imdb && (
                  imdbUrl
                    ? <a href={imdbUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize:'0.88rem', fontWeight:700, color:'var(--amber-dark)', textDecoration:'none' }}>⭐ {movie.rating_imdb} IMDb</a>
                    : <span style={{ fontSize:'0.88rem', fontWeight:700, color:'var(--amber-dark)' }}>⭐ {movie.rating_imdb} IMDb</span>
                )}
                {movie.rating_rt && (
                  <a href={'https://www.rottentomatoes.com/search?search=' + encodeURIComponent(movie.title)} target="_blank" rel="noopener noreferrer" style={{ fontSize:'0.88rem', fontWeight:700, color:'#fa320a', textDecoration:'none' }}>🍅 {movie.rating_rt}</a>
                )}
              </div>

              {movie.director && <div style={{ fontSize:'0.85rem', color:'var(--text-dim)' }}><strong>Director:</strong> {movie.director}</div>}
              {movie.actors   && <div style={{ fontSize:'0.85rem', color:'var(--text-dim)' }}><strong>Cast:</strong> {movie.actors}</div>}
              {movie.plot     && <div style={{ fontSize:'0.88rem', lineHeight:1.6, color:'var(--text)' }}>{movie.plot}</div>}

              {/* Borrow / Return actions — no info boxes, just buttons */}
              {iMineToReturn ? (
                <button onClick={handleReturn} disabled={returning}
                  style={{ background:'var(--teal)', color:'#fff', border:'none', borderRadius:'10px', padding:'0.9rem', fontSize:'0.95rem', fontWeight:700, cursor:returning?'not-allowed':'pointer', opacity:returning?0.6:1, width:'100%' }}>
                  {returning ? 'Returning…' : '↩ Return this DVD'}
                </button>
              ) : canBorrow ? (
                <button onClick={handleBorrow} disabled={borrowing || !memberId}
                  style={{ background:'var(--teal)', color:'#fff', border:'none', borderRadius:'10px', padding:'0.9rem', fontSize:'0.95rem', fontWeight:700, cursor:(borrowing||!memberId)?'not-allowed':'pointer', opacity:(borrowing||!memberId)?0.6:1, width:'100%' }}>
                  {borrowing ? 'Borrowing…' : '📀 Borrow this DVD'}
                </button>
              ) : !activeLoan && myLoanCount >= 3 ? (
                <div style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:'10px', padding:'0.75rem 1rem', fontSize:'0.85rem', color:'var(--text)', textAlign:'center' }}>
                  ⚠️ You have 3 DVDs on loan — return one first.
                </div>
              ) : null}


            </div>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <div onClick={() => setConfirmDelete(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem' }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'var(--surface)', borderRadius:'16px', padding:'1.5rem', width:'100%', maxWidth:320 }}>
            <div style={{ fontWeight:700, marginBottom:'0.5rem' }}>Remove DVD?</div>
            <div style={{ fontSize:'0.88rem', color:'var(--text-dim)', marginBottom:'1.25rem', lineHeight:1.5 }}>Remove &quot;{movie.title}&quot; from the DVD library?</div>
            <div style={{ display:'flex', gap:'0.75rem' }}>
              <button onClick={() => setConfirmDelete(false)} style={{ flex:1, padding:'0.75rem', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'10px', fontSize:'0.9rem', fontWeight:600, cursor:'pointer', color:'var(--text)' }}>Cancel</button>
              <button onClick={handleDelete} style={{ flex:1, padding:'0.75rem', background:'var(--danger)', border:'none', borderRadius:'10px', fontSize:'0.9rem', fontWeight:600, cursor:'pointer', color:'#fff' }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── DVD Card ──────────────────────────────────────────────────────────────────
function DvdCard({ movie, activeLoan, myLoan, onClick }) {
  const genres    = parseGenres(movie.genre)
  const leadActor = movie.actors ? movie.actors.split(',')[0].trim() : null

  // Loan badge config
  const loanBadge = myLoan
    ? { label:'On Loan', sub:'Tap to return', bg:'var(--teal)', color:'#fff' }
    : activeLoan
    ? { label:'On Loan', sub:'Unavailable', bg:'var(--surface2)', color:'var(--text-dim)' }
    : null

  return (
    <div onClick={onClick} style={{ background:'var(--surface)', borderRadius:'12px', border:'1px solid var(--border)', borderLeft:'3px solid ' + (myLoan ? 'var(--teal)' : activeLoan ? 'var(--border)' : 'var(--teal)'), display:'flex', overflow:'hidden', boxShadow:'var(--shadow)', cursor:'pointer', minHeight:110, opacity:activeLoan && !myLoan ? 0.75 : 1 }}>
      {/* Poster */}
      {movie.poster_url
        ? <img src={movie.poster_url} alt={movie.title} style={{ width:75, objectFit:'cover', flexShrink:0 }} />
        : <div style={{ width:75, background:'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.8rem', flexShrink:0 }}>💿</div>}

      {/* Main content */}
      <div style={{ flex:1, padding:'0.75rem', display:'flex', flexDirection:'column', justifyContent:'center', gap:'0.3rem', overflow:'hidden', minWidth:0 }}>
        <div style={{ fontWeight:700, fontSize:'0.9rem', lineHeight:1.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{movie.title}</div>
        {leadActor && (
          <div style={{ fontSize:'0.75rem', color:'var(--text-dim)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {leadActor}
            {movie.rating_imdb && !activeLoan && <span style={{ color:'var(--amber-dark)', fontWeight:600 }}> · ⭐{movie.rating_imdb}</span>}
          </div>
        )}
        {!leadActor && movie.year && <div style={{ fontSize:'0.75rem', color:'var(--text-dim)' }}>{movie.year}</div>}
        {!activeLoan && genres.length > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:'0.3rem', flexWrap:'wrap', marginTop:'0.1rem' }}>
            {movie.rating && <span style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'4px', padding:'0.1rem 0.35rem', fontSize:'0.65rem', fontWeight:700, color:'var(--text-dim)' }}>{movie.rating}</span>}
            {genres.slice(0,2).map(g=><span key={g} style={{ background:'var(--surface2)', borderRadius:'20px', padding:'0.1rem 0.4rem', fontSize:'0.65rem', color:'var(--text-dim)' }}>{g}</span>)}
          </div>
        )}
      </div>

      {/* Right badge — prominent on-loan indicator */}
      {loanBadge && (
        <div style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'0.75rem 0.85rem', gap:'0.25rem', minWidth:72 }}>
          <div style={{ background:loanBadge.bg, color:loanBadge.color, borderRadius:'10px', padding:'0.35rem 0.55rem', textAlign:'center' }}>
            <div style={{ fontSize:'1.25rem', lineHeight:1 }}>📀</div>
            <div style={{ fontSize:'0.6rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.04em', marginTop:'0.2rem', lineHeight:1.1 }}>{loanBadge.label}</div>
          </div>
          <div style={{ fontSize:'0.6rem', color:'var(--text-dim)', textAlign:'center', lineHeight:1.2 }}>{loanBadge.sub}</div>
        </div>
      )}
    </div>
  )
}

// ── Add DVD Sheet (admin only) ────────────────────────────────────────────────
function AddDvdSheet({ session, onAdded, onClose, addToast }) {
  const [search,    setSearch]    = useState('')
  const [results,   setResults]   = useState([])
  const [searching, setSearching] = useState(false)
  const [selected,  setSelected]  = useState(null)
  const [adding,    setAdding]    = useState(false)

  async function doSearch(q) {
    setSearch(q); setSelected(null)
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    const res = await fetch('/api/tmdb/search?q=' + encodeURIComponent(q))
    setResults(await res.json())
    setSearching(false)
  }

  async function handleAdd() {
    if (!selected) return
    setAdding(true)
    const res = await fetch('/api/admin/dvd-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session?.access_token },
      body: JSON.stringify({ tmdb_id: selected.tmdb_id }),
    })
    const data = await res.json()
    setAdding(false)
    if (!res.ok) { addToast(data.error || 'Add failed', 'error'); return }
    addToast(data.title + ' added to DVD Library')
    onAdded()
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:640, background:'var(--surface)', borderRadius:'20px 20px 0 0', maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
        {/* Handle */}
        <div style={{ padding:'0.6rem 1.25rem 0', display:'flex', justifyContent:'center' }}>
          <div style={{ width:40, height:4, background:'var(--border)', borderRadius:2 }} />
        </div>
        {/* Header */}
        <div style={{ padding:'0.6rem 1.25rem 0.75rem', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ fontWeight:700, fontSize:'1rem' }}>➕ Add DVD to Library</div>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:'50%', background:'var(--surface2)', border:'none', fontSize:'1.1rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-dim)' }}>✕</button>
        </div>
        {/* Body */}
        <div style={{ padding:'1rem 1.25rem 2rem', overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:'0.75rem' }}>
          <div style={{ position:'relative' }}>
            <input value={search} onChange={e => doSearch(e.target.value)}
              placeholder="Search movie title…"
              style={{ width:'100%', padding:'0.7rem 0.85rem', border:'1.5px solid var(--border)', borderRadius:'12px', fontSize:'0.9rem', background:'var(--surface)', boxSizing:'border-box', fontFamily:'inherit' }} />
            {searching && <div style={{ position:'absolute', right:'0.75rem', top:'50%', transform:'translateY(-50%)', fontSize:'0.75rem', color:'var(--text-dim)' }}>…</div>}
            {results.length > 0 && !selected && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', zIndex:50, overflow:'hidden', boxShadow:'0 4px 16px rgba(0,0,0,0.2)', marginTop:'0.25rem' }}>
                {results.map(r => (
                  <div key={r.tmdb_id} onClick={() => { setSelected(r); setSearch(r.title + (r.year ? ` (${r.year})` : '')); setResults([]) }}
                    style={{ display:'flex', alignItems:'center', gap:'0.65rem', padding:'0.65rem 0.85rem', cursor:'pointer', borderBottom:'1px solid var(--border)' }}>
                    {r.poster_url ? <img src={r.poster_url} alt={r.title} style={{ width:32, height:46, objectFit:'cover', borderRadius:4 }} /> : <div style={{ width:32, height:46, background:'var(--surface2)', borderRadius:4 }} />}
                    <div>
                      <div style={{ fontWeight:700, fontSize:'0.9rem' }}>{r.title}</div>
                      {r.year && <div style={{ fontSize:'0.75rem', color:'var(--text-dim)' }}>{r.year}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {selected && (
            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', background:'var(--surface2)', borderRadius:'12px', padding:'0.75rem', border:'1px solid var(--teal)' }}>
              {selected.poster_url ? <img src={selected.poster_url} alt={selected.title} style={{ width:46, height:68, objectFit:'cover', borderRadius:6 }} /> : <div style={{ width:46, height:68, background:'var(--surface)', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.5rem' }}>💿</div>}
              <div>
                <div style={{ fontWeight:700, fontSize:'0.95rem' }}>{selected.title}</div>
                {selected.year && <div style={{ fontSize:'0.8rem', color:'var(--text-dim)' }}>{selected.year}</div>}
              </div>
            </div>
          )}
          <button onClick={handleAdd} disabled={!selected || adding}
            style={{ background:'var(--teal)', color:'#fff', border:'none', borderRadius:'12px', padding:'0.9rem', fontSize:'0.95rem', fontWeight:700, cursor:(!selected||adding)?'not-allowed':'pointer', opacity:(!selected||adding)?0.5:1 }}>
            {adding ? 'Adding to Library…' : '💿 Add to DVD Library'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DvdPage() {
  const [movies,        setMovies]        = useState([])
  const [loans,         setLoans]         = useState([])
  const [member,        setMember]        = useState(null)
  const [session,       setSession]       = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [search,        setSearch]        = useState('')
  const [sortBy,        setSortBy]        = useState('az')
  const [genreFilter,   setGenreFilter]   = useState('')
  const [filterExpanded,setFilterExpanded]= useState(false)
  const [selected,      setSelected]      = useState(null)
  const [showMyLoans,   setShowMyLoans]   = useState(false)
  const [showAddDvd,    setShowAddDvd]    = useState(false)
  const [toasts,        setToasts]        = useState([])

  function addToast(message, type='success') {
    const id = Date.now()
    setToasts(prev=>[...prev,{id,message,type}])
    setTimeout(()=>setToasts(prev=>prev.filter(t=>t.id!==id)),4000)
  }

  const loadLoans = useCallback(async () => {
    const { data } = await supabase
      .from('dvd_loans')
      .select('id, movie_id, member_id, borrowed_at, members(name)')
      .is('returned_at', null)
    setLoans(data || [])
  }, [])

  const loadData = useCallback(async () => {
    const { data } = await supabase.from('movies').select('*').eq('we_own', true).order('title')
    setMovies(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data:{ session:s } }) => {
      setSession(s)
      if (s) supabase.from('members').select('id, is_admin').eq('auth_id', s.user.id).single().then(({ data }) => setMember(data))
    })
    loadData()
    loadLoans()
  }, [loadData, loadLoans])

  const loansMap    = Object.fromEntries(loans.map(l => [l.movie_id, l]))
  const myLoanCount = member ? loans.filter(l => l.member_id === member.id).length : 0
  const myLoans     = member ? loans.filter(l => l.member_id === member.id) : []

  const allGenres = [...new Set(movies.flatMap(m => parseGenres(m.genre)))].sort()

  const filtered = movies.filter(m => {
    const q = search.toLowerCase()
    const matchesSearch = !search || m.title.toLowerCase().includes(q) || (m.actors && m.actors.toLowerCase().includes(q))
    const matchesGenre  = !genreFilter || parseGenres(m.genre).includes(genreFilter)
    return matchesSearch && matchesGenre
  })

  const sorted = [...filtered].sort((a, b) =>
    sortBy === 'imdb' ? (parseFloat(b.rating_imdb)||0) - (parseFloat(a.rating_imdb)||0) : a.title.localeCompare(b.title)
  )

  const selectedMovie = selected ? movies.find(m => m.id === selected) : null

  return (
    <div style={{ background:'var(--bg)', minHeight:'100vh' }}>
      <Toast toasts={toasts} />
      <div style={{ padding:'1rem 1rem 6rem' }}>

        {/* My Loans banner — shows when you have DVDs out */}
        {myLoanCount > 0 && (
          <button onClick={() => setShowMyLoans(true)}
            style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--teal)', color:'#fff', border:'none', borderRadius:'14px', padding:'0.85rem 1.1rem', marginBottom:'1rem', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,128,128,0.25)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.65rem' }}>
              <span style={{ fontSize:'1.5rem' }}>📀</span>
              <div style={{ textAlign:'left' }}>
                <div style={{ fontWeight:700, fontSize:'0.92rem' }}>You have {myLoanCount} DVD{myLoanCount>1?'s':''} on loan</div>
                <div style={{ fontSize:'0.75rem', opacity:0.88 }}>Tap to view &amp; return</div>
              </div>
            </div>
            <span style={{ fontSize:'1.3rem', opacity:0.9 }}>›</span>
          </button>
        )}

        {/* Info card */}
        <div style={{ background:'var(--surface)', borderRadius:'14px', padding:'1rem', marginBottom:'1rem', border:'1px solid var(--border)', borderLeft:'4px solid var(--teal)', fontSize:'0.88rem', lineHeight:1.6 }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:'0.6rem' }}>
            <span style={{ fontSize:'1.4rem', flexShrink:0 }}>💿</span>
            <div>
              <div style={{ fontWeight:700, color:'var(--teal)', fontSize:'0.8rem', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.2rem' }}>DVD Library</div>
              DVDs available in the cinema for residents to borrow. Tap a title to borrow or return.
            </div>
          </div>
        </div>

        {/* Search */}
        <div style={{ marginBottom:'0.75rem' }}>
          <input placeholder="Search by title or actor..." value={search} onChange={e=>setSearch(e.target.value)}
            style={{ width:'100%', padding:'0.7rem 0.85rem', border:'1.5px solid var(--border)', borderRadius:'12px', fontSize:'0.9rem', background:'var(--surface)', boxSizing:'border-box', fontFamily:'inherit' }} />
        </div>

        {/* Genre filter */}
        {(() => {
          const VISIBLE = 8
          const btnStyle = (active) => ({ padding:'0.3rem 0.75rem', borderRadius:'20px', border:'1.5px solid', borderColor:active?'var(--teal)':'var(--border)', background:active?'var(--teal)':'var(--surface)', color:active?'#fff':'var(--text)', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' })
          const moreStyle = { padding:'0.3rem 0.75rem', borderRadius:'20px', border:'1.5px dashed var(--border)', background:'transparent', color:'var(--text-dim)', fontSize:'0.75rem', fontWeight:500, cursor:'pointer', opacity:0.7 }
          const needsCollapse = !filterExpanded && allGenres.length > VISIBLE
          const shown = needsCollapse ? allGenres.slice(0, VISIBLE - 1) : allGenres
          const hidden = allGenres.length - (VISIBLE - 1)
          const selectedHidden = needsCollapse && genreFilter && !shown.includes(genreFilter)
          return allGenres.length > 0 ? (
            <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', marginBottom:'0.85rem' }}>
              <button onClick={()=>setGenreFilter('')} style={btnStyle(!genreFilter)}>All</button>
              {shown.map(g => <button key={g} onClick={()=>setGenreFilter(g===genreFilter?'':g)} style={btnStyle(genreFilter===g)}>{g}</button>)}
              {selectedHidden && <button onClick={()=>setGenreFilter('')} style={btnStyle(true)}>{genreFilter}</button>}
              {needsCollapse && <button onClick={()=>setFilterExpanded(true)} style={moreStyle}>+{hidden} more</button>}
              {filterExpanded && allGenres.length > VISIBLE && <button onClick={()=>setFilterExpanded(false)} style={moreStyle}>Show less</button>}
            </div>
          ) : null
        })()}

        {/* Sort + count + admin Add DVD */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
          <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--teal)', letterSpacing:'0.08em', textTransform:'uppercase' }}>
            {sorted.length} title{sorted.length!==1?'s':''}
          </div>
          <div style={{ display:'flex', gap:'0.4rem', alignItems:'center' }}>
            {member?.is_admin && (
              <button onClick={() => setShowAddDvd(true)}
                style={{ padding:'0.3rem 0.75rem', borderRadius:'10px', border:'1.5px solid var(--teal)', background:'var(--teal)', color:'#fff', fontSize:'0.75rem', fontWeight:700, cursor:'pointer' }}>
                + Add DVD
              </button>
            )}
            {[['az','A–Z'],['imdb','IMDb']].map(([k,l]) => (
              <button key={k} onClick={()=>setSortBy(k)}
                style={{ padding:'0.3rem 0.75rem', borderRadius:'10px', border:'1.5px solid', borderColor:sortBy===k?'var(--teal)':'var(--border)', background:sortBy===k?'var(--teal)':'var(--surface)', color:sortBy===k?'#fff':'var(--text)', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:'3rem' }}><div className="spinner" /></div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign:'center', color:'var(--text-dim)', padding:'3rem' }}>
            <div style={{ fontSize:'2.5rem', marginBottom:'0.75rem' }}>💿</div>
            <div style={{ fontSize:'0.9rem', fontWeight:600 }}>{search || genreFilter ? 'No DVDs match your search' : 'No DVDs in the library yet'}</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.65rem' }}>
            {sorted.map(m => (
              <DvdCard
                key={m.id}
                movie={m}
                activeLoan={loansMap[m.id] || null}
                myLoan={loansMap[m.id] && member && loansMap[m.id].member_id === member.id ? loansMap[m.id] : null}
                onClick={()=>setSelected(m.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail sheet */}
      {selectedMovie && (
        <DvdDetailSheet
          movie={selectedMovie}
          isAdmin={member?.is_admin}
          session={session}
          memberId={member?.id || null}
          myLoanCount={myLoanCount}
          activeLoan={loansMap[selectedMovie.id] || null}
          onClose={()=>setSelected(null)}
          onDeleted={()=>{ setSelected(null); loadData() }}
          onLoansChanged={()=>{ loadLoans(); setSelected(null) }}
          addToast={addToast}
        />
      )}

      {/* My Loans sheet */}
      {showMyLoans && (
        <MyLoansSheet
          myLoans={myLoans}
          movies={movies}
          onReturn={loadLoans}
          onClose={()=>setShowMyLoans(false)}
          addToast={addToast}
        />
      )}

      {/* Add DVD sheet — admin only */}
      {showAddDvd && (
        <AddDvdSheet
          session={session}
          onAdded={() => { loadData(); setShowAddDvd(false) }}
          onClose={() => setShowAddDvd(false)}
          addToast={addToast}
        />
      )}
    </div>
  )
}

