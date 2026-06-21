'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

function streamingPill(streamingAu, weOwn) {
  if (weOwn) return { label: 'Free', bg: '#dcfce7', color: '#15803d' }
  if (!streamingAu) return null
  const s = streamingAu.trim().toLowerCase()
  if (s.startsWith('rent') || s.startsWith('buy')) return { label: 'Cost', bg: '#fef3c7', color: '#d97706' }
  return { label: 'Free', bg: '#dcfce7', color: '#15803d' }
}
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
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:'0.4rem' }}>
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <button key={n} onClick={()=>onVote(n)} disabled={loading}
            style={{ padding:'0.55rem 0', borderRadius:'10px', border:'2px solid', borderColor:current===n?'var(--teal)':'var(--border)', background:current===n?'var(--teal)':'var(--surface2)', color:current===n?'#fff':'var(--text)', fontWeight:700, fontSize:'1rem', cursor:loading?'not-allowed':'pointer', opacity:loading?0.6:1 }}>
            {n}
          </button>
        ))}
      </div>
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
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:640 }}>{children}</div>
    </div>
  )
}

function SuggestOverlay({ children, onClose }) {
  const [bottomOffset, setBottomOffset] = React.useState(0)
  React.useEffect(() => {
    const vv = window.visualViewport; if (!vv) return
    function update() { setBottomOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop)) }
    vv.addEventListener('resize', update); vv.addEventListener('scroll', update)
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update) }
  }, [])
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:640, marginBottom:bottomOffset, transition:'margin-bottom 0.18s ease' }}>{children}</div>
    </div>
  )
}

function DetailSheet({ movie, myVote, avgData, memberId, isAdmin, session, onClose, onVoted, onDeleted, addToast }) {
  const [voting, setVoting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const pill = streamingPill(movie.streaming_au, movie.we_own)
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
    const res = await fetch(`/api/movies/${movie.id}`, { method:'DELETE', headers:{ 'Authorization':`Bearer ${session.access_token}` } })
    setDeleting(false)
    if (!res.ok) { const d=await res.json().catch(()=>({})); addToast(d.error||'Delete failed','error'); return }
    addToast(`${movie.title} removed`); onClose(); onDeleted()
  }

  return (
    <>
      <div style={{ background:'var(--surface)', borderRadius:'20px 20px 0 0', maxHeight:'92vh', overflowY:'auto' }}>
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
            <div style={{ fontWeight:800, fontSize:'1.2rem', lineHeight:1.2 }}>{movie.title}</div>
            {movie.year && <div style={{ color:'var(--text-dim)', fontSize:'0.85rem', marginTop:'0.2rem' }}>{movie.year}{movie.runtime&&` · ${movie.runtime}`}</div>}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem', alignItems:'center' }}>
            <GenreChips genres={genres} />
            {pill && <span style={{ background:pill.bg, color:pill.color, borderRadius:'20px', padding:'0.2rem 0.65rem', fontSize:'0.75rem', fontWeight:700 }}>● {pill.label}</span>}
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
      {confirmDelete && <ConfirmDialog title="Remove movie?" message={`Remove "${movie.title}" and all its ratings?`} confirmLabel="Remove" confirmColor="var(--danger)" onConfirm={handleDelete} onCancel={()=>setConfirmDelete(false)} />}
    </>
  )
}

function SuggestSheet({ session, onClose, onAdded, addToast }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [preview, setPreview] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [saving, setSaving] = useState(false)

  async function search() {
    if (!query.trim()) return
    setSearching(true)
    const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}`)
    setResults(await res.json() || []); setSearching(false)
  }
  async function pickMovie(tmdbId) {
    setLoadingPreview(true); setResults([])
    const res = await fetch(`/api/tmdb/details?id=${tmdbId}`)
    setPreview(await res.json()); setLoadingPreview(false)
  }
  async function handleAdd() {
    if (!preview) return
    setSaving(true)
    const res = await fetch('/api/movies/add', { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}` }, body:JSON.stringify(preview) })
    const data = await res.json(); setSaving(false)
    if (!res.ok) { addToast(data.error||'Failed to add','error'); return }
    addToast(`${preview.title} added!`); onAdded(); onClose()
  }

  return (
    <div style={{ background:'var(--surface)', borderRadius:'20px 20px 0 0', padding:'1.5rem', maxHeight:'90vh', minHeight:'55vh', overflowY:'auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
        <h2 style={{ fontSize:'1.1rem', fontWeight:700 }}>Suggest a Movie</h2>
        <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'1.5rem', cursor:'pointer', color:'var(--text-dim)' }}>×</button>
      </div>
      {!preview && (
        <>
          <div style={{ display:'flex', gap:'0.5rem', marginBottom:'0.75rem' }}>
            <input placeholder="Search by title…" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search()} autoFocus
              style={{ flex:1, padding:'0.65rem 0.85rem', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'0.9rem', background:'var(--surface2)', fontFamily:'inherit' }} />
            <button onClick={search} disabled={searching}
              style={{ padding:'0.65rem 1rem', background:'var(--teal)', color:'#fff', border:'none', borderRadius:'10px', fontWeight:600, cursor:searching?'not-allowed':'pointer', opacity:searching?0.6:1 }}>
              {searching?'…':'Search'}
            </button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
            {results.map(r=>(
              <div key={r.tmdb_id} onClick={()=>pickMovie(r.tmdb_id)}
                style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.65rem', background:'var(--surface2)', borderRadius:'10px', cursor:'pointer', border:'1px solid var(--border)' }}>
                {r.poster_url && <img src={r.poster_url} alt="" style={{ width:36, height:54, objectFit:'cover', borderRadius:4 }} />}
                <div><div style={{ fontWeight:600, fontSize:'0.9rem' }}>{r.title}</div>{r.year&&<div style={{ color:'var(--text-dim)', fontSize:'0.8rem' }}>{r.year}</div>}</div>
              </div>
            ))}
          </div>
          {loadingPreview && <div style={{ display:'flex', justifyContent:'center', padding:'2rem' }}><div className="spinner" /></div>}
        </>
      )}
      {preview && (
        <div>
          <div style={{ display:'flex', gap:'0.85rem', marginBottom:'1rem' }}>
            {preview.poster_url && <img src={preview.poster_url} alt="" style={{ width:70, height:105, objectFit:'cover', borderRadius:8, flexShrink:0 }} />}
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:'1rem' }}>{preview.title}</div>
              {preview.year&&<div style={{ color:'var(--text-dim)', fontSize:'0.82rem' }}>{preview.year} · {preview.runtime}</div>}
              {preview.genre&&<div style={{ color:'var(--text-dim)', fontSize:'0.82rem', marginTop:'0.2rem' }}>{preview.genre}</div>}
              {preview.director&&<div style={{ color:'var(--text-dim)', fontSize:'0.82rem' }}>Dir: {preview.director}</div>}
            </div>
          </div>
          {preview.plot&&<div style={{ fontSize:'0.85rem', color:'var(--text-dim)', lineHeight:1.5, marginBottom:'1rem' }}>{preview.plot}</div>}
          {preview.rating_imdb&&<div style={{ fontSize:'0.85rem', marginBottom:'1.25rem' }}>★ IMDB {preview.rating_imdb}</div>}
          <div style={{ display:'flex', gap:'0.65rem' }}>
            <button onClick={()=>setPreview(null)} style={{ flex:1, padding:'0.8rem', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'10px', fontSize:'0.9rem', cursor:'pointer', fontWeight:600 }}>← Back</button>
            <button onClick={handleAdd} disabled={saving} style={{ flex:2, padding:'0.8rem', background:'var(--teal)', color:'#fff', border:'none', borderRadius:'10px', fontSize:'0.9rem', fontWeight:600, cursor:saving?'not-allowed':'pointer', opacity:saving?0.6:1 }}>
              {saving?'Adding…':'Add to Suggestions'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MovieCard({ movie, myVote, avgData, onClick }) {
  const pill = streamingPill(movie.streaming_au, movie.we_own)
  const genres = parseGenres(movie.genre)
  return (
    <div onClick={onClick} style={{ background:'var(--surface)', borderRadius:'12px', border:'1px solid var(--border)', borderLeft:'3px solid var(--teal)', display:'flex', overflow:'hidden', boxShadow:'var(--shadow)', cursor:'pointer', minHeight:100 }}>
      {movie.poster_url
        ? <img src={movie.poster_url} alt={movie.title} style={{ width:70, objectFit:'cover', flexShrink:0 }} />
        : <div style={{ width:70, background:'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.5rem', flexShrink:0 }}>🎬</div>}
      <div style={{ flex:1, padding:'0.7rem 0.75rem', overflow:'hidden' }}>
        <div style={{ fontWeight:700, fontSize:'0.9rem', lineHeight:1.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{movie.title}</div>
        {movie.actors && <div style={{ color:'var(--text-dim)', fontSize:'0.75rem', marginTop:'0.15rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{movie.actors.split(',')[0]?.trim()}</div>}
        {genres.length>0 && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:'0.25rem', marginTop:'0.3rem' }}>
            {genres.slice(0,2).map(g=><span key={g} style={{ background:'var(--surface2)', borderRadius:'20px', padding:'0.12rem 0.45rem', fontSize:'0.68rem', color:'var(--text-dim)' }}>{g}</span>)}
          </div>
        )}
        {pill && <div style={{ marginTop:'0.3rem' }}><span style={{ background:pill.bg, color:pill.color, borderRadius:'20px', padding:'0.12rem 0.45rem', fontSize:'0.68rem', fontWeight:700 }}>● {pill.label}</span></div>}
      </div>
      <div style={{ padding:'0.7rem 0.85rem', display:'flex', flexDirection:'column', alignItems:'flex-end', justifyContent:'center', gap:'0.25rem', flexShrink:0, minWidth:72 }}>
        {avgData?.count>0 ? (
          <div style={{ position:'relative', textAlign:'right' }}>
            <span style={{ position:'absolute', top:0, left:0, fontSize:'0.58rem', fontWeight:700, color:'var(--teal)', lineHeight:1 }}>({avgData.count})</span>
            <div style={{ fontSize:'1.3rem', fontWeight:800, color:'var(--teal)', lineHeight:1, paddingTop:'0.6rem' }}>{avgData.avg.toFixed(1)}</div>
          </div>
        ) : <div style={{ fontSize:'0.7rem', color:'var(--text-dim)', textAlign:'right' }}>Not yet<br/>rated</div>}
        {myVote && <div style={{ fontSize:'0.7rem', color:'var(--teal)', fontWeight:700 }}>you: {myVote}</div>}
        {movie.rating_imdb && (movie.imdb_id
          ? <a href={`https://www.imdb.com/title/${movie.imdb_id}/`} target="_blank" rel="noopener noreferrer" style={{ fontSize:'0.7rem', color:'var(--amber-dark)', fontWeight:600, textDecoration:'none', display:'block' }}>★ {movie.rating_imdb}</a>
          : <div style={{ fontSize:'0.7rem', color:'var(--amber-dark)', fontWeight:600 }}>★ {movie.rating_imdb}</div>)}
        {movie.rating_rt && <a href={`https://www.rottentomatoes.com/search?search=${encodeURIComponent(movie.title)}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:'0.7rem', color:'#fa320a', fontWeight:600, textDecoration:'none', display:'block' }}>🍅 {movie.rating_rt}</a>}
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
  const [toasts, setToasts] = useState([])

  function addToast(message, type='success') {
    const id = Date.now()
    setToasts(prev=>[...prev,{id,message,type}])
    setTimeout(()=>setToasts(prev=>prev.filter(t=>t.id!==id)),4000)
  }

  const loadData = useCallback(async () => {
    const [{ data: moviesData }, { data: votesData }] = await Promise.all([
      supabase.from('movies').select('*').eq('we_own', false).order('title'),
      supabase.from('votes').select('movie_id, member_id, score'),
    ])
    setMovies(moviesData||[])
    setVotes(votesData||[])
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
        <div style={{ background:'var(--surface)', borderRadius:'14px', padding:'1rem', marginBottom:'1rem', border:'1px solid var(--border)', borderLeft:'4px solid var(--teal)', fontSize:'0.88rem', lineHeight:1.6 }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:'0.6rem' }}>
            <span style={{ fontSize:'1.4rem', flexShrink:0 }}>🗳️</span>
            <div>
              <div style={{ fontWeight:700, color:'var(--teal)', fontSize:'0.8rem', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.2rem' }}>Viewing Suggestions</div>
              Films suggested by residents for future screenings. <strong>Score each movie to have your say</strong> — the higher the community vote, the more likely it is to make the big screen!
            </div>
          </div>
        </div>

        <div style={{ position:'relative', marginBottom:'1rem' }}>
          <span style={{ position:'absolute', left:'0.85rem', top:'50%', transform:'translateY(-50%)', color:'var(--text-dim)' }}>🔍</span>
          <input placeholder="Search movies…" value={search} onChange={e=>setSearch(e.target.value)}
            style={{ width:'100%', padding:'0.7rem 0.85rem 0.7rem 2.4rem', border:'1.5px solid var(--border)', borderRadius:'12px', fontSize:'0.9rem', background:'var(--surface)', boxSizing:'border-box', fontFamily:'inherit' }} />
        </div>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
          <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--teal)', letterSpacing:'0.08em', textTransform:'uppercase' }}>
            ✦ {sorted.length} film{sorted.length!==1?'s':''} — tap to view &amp; vote
          </div>
          <button onClick={()=>setShowSuggest(true)} style={{ background:'var(--teal)', color:'#fff', border:'none', borderRadius:'20px', padding:'0.4rem 0.9rem', fontSize:'0.8rem', fontWeight:700, cursor:'pointer' }}>
            + Suggest
          </button>
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
          const FIXED = [['all','All'],['unscored','Unscored']]
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
              <MovieCard key={m.id} movie={m} myVote={myVotes[m.id]} avgData={avgVotes[m.id]} onClick={()=>setSelectedId(m.id)} />
            ))}
          </div>
        )}
      </div>

      {selectedMovie && (
        <Overlay onClose={()=>setSelectedId(null)}>
          <DetailSheet movie={selectedMovie} myVote={myVotes[selectedMovie.id]} avgData={avgVotes[selectedMovie.id]} memberId={member?.id} isAdmin={member?.is_admin} session={session} onClose={()=>setSelectedId(null)} onVoted={loadData} onDeleted={()=>{ setSelectedId(null); loadData() }} addToast={addToast} />
        </Overlay>
      )}
      {showSuggest && (
        <SuggestOverlay onClose={()=>setShowSuggest(false)}>
          <SuggestSheet session={session} onClose={()=>setShowSuggest(false)} onAdded={loadData} addToast={addToast} />
        </SuggestOverlay>
      )}
    </div>
  )
}

