'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

function parseGenres(g) {
  if (!g) return []
  return g.split(/[,|\/]/).map(x => x.trim()).filter(Boolean)
}

function GenreChips({ genres, max = 6 }) {
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

function fmtDate(str) {
  if (!str) return ''
  return new Date(str).toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' })
}

function DvdDetailSheet({ movie, isAdmin, session, memberId, myLoanCount, activeLoan, onClose, onDeleted, onLoansChanged, addToast }) {
  const [deleting,       setDeleting]       = useState(false)
  const [confirmDelete,  setConfirmDelete]  = useState(false)
  const [borrowing,      setBorrowing]      = useState(false)
  const [returning,      setReturning]      = useState(false)
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
        <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:640, background:'var(--surface)', borderRadius:'20px 20px 0 0', maxHeight:'92vh', overflowY:'auto' }}>
          {movie.poster_url && (
            <div style={{ position:'relative', height:180, overflow:'hidden', borderRadius:'20px 20px 0 0' }}>
              <img src={movie.poster_url} alt={movie.title} style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'top', filter:'blur(2px) brightness(0.6)', transform:'scale(1.05)' }} />
              <img src={movie.poster_url} alt={movie.title} style={{ position:'absolute', left:'1.25rem', bottom:'-40px', width:80, height:120, objectFit:'cover', borderRadius:8, boxShadow:'0 4px 16px rgba(0,0,0,0.4)' }} />
              <button onClick={onClose} style={{ position:'absolute', top:'0.75rem', right:'0.75rem', width:32, height:32, borderRadius:'50%', background:'rgba(0,0,0,0.5)', border:'none', color:'#fff', fontSize:'1.1rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>
          )}
          <div style={{ padding:movie.poster_url?'3rem 1.25rem 2rem':'1.5rem 1.25rem', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
            {!movie.poster_url && <div style={{ display:'flex', justifyContent:'flex-end' }}><button onClick={onClose} style={{ background:'none', border:'none', fontSize:'1.5rem', cursor:'pointer', color:'var(--text-dim)' }}>✕</button></div>}
            <div>
              <div style={{ fontWeight:800, fontSize:'1.2rem', lineHeight:1.2 }}>{movie.title}</div>
              {movie.year && <div style={{ color:'var(--text-dim)', fontSize:'0.85rem', marginTop:'0.2rem' }}>{movie.year}{movie.runtime ? ' · ' + movie.runtime : ''}</div>}
            </div>

            {genres.length > 0 && <GenreChips genres={genres} />}

            {/* Ratings row */}
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

            {/* Borrow / Return / On Loan status */}
            {iMineToReturn ? (
              <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                <div style={{ background:'rgba(0,128,128,0.06)', border:'1px solid rgba(0,128,128,0.2)', borderRadius:'12px', padding:'0.85rem 1rem', fontSize:'0.88rem', color:'var(--text)', lineHeight:1.5 }}>
                  📀 You borrowed this on {fmtDate(activeLoan.borrowed_at)}. Return it to the cinema when you&apos;re done.
                </div>
                <button onClick={handleReturn} disabled={returning}
                  style={{ background:'var(--teal)', color:'#fff', border:'none', borderRadius:'10px', padding:'0.8rem', fontSize:'0.95rem', fontWeight:700, cursor:returning?'not-allowed':'pointer', opacity:returning?0.6:1, width:'100%' }}>
                  {returning ? 'Returning…' : 'Return DVD'}
                </button>
              </div>
            ) : onLoanByOther ? (
              <div style={{ background:'rgba(220,38,38,0.06)', border:'1px solid rgba(220,38,38,0.2)', borderRadius:'12px', padding:'0.85rem 1rem', fontSize:'0.88rem', color:'var(--text)', lineHeight:1.5 }}>
                📤 On loan to {activeLoan.members?.name || 'a resident'} since {fmtDate(activeLoan.borrowed_at)}. Check back soon.
              </div>
            ) : canBorrow ? (
              <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                <div style={{ background:'rgba(0,128,128,0.06)', border:'1px solid rgba(0,128,128,0.2)', borderRadius:'12px', padding:'0.85rem 1rem', fontSize:'0.88rem', color:'var(--text)', lineHeight:1.5 }}>
                  💿 This DVD is available. You can borrow it and return it when you&apos;re done.
                </div>
                <button onClick={handleBorrow} disabled={borrowing || !memberId}
                  style={{ background:'var(--teal)', color:'#fff', border:'none', borderRadius:'10px', padding:'0.8rem', fontSize:'0.95rem', fontWeight:700, cursor:(borrowing||!memberId)?'not-allowed':'pointer', opacity:(borrowing||!memberId)?0.6:1, width:'100%' }}>
                  {borrowing ? 'Borrowing…' : 'Borrow DVD'}
                </button>
              </div>
            ) : !activeLoan && myLoanCount >= 3 ? (
              <div style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:'12px', padding:'0.85rem 1rem', fontSize:'0.88rem', color:'var(--text)', lineHeight:1.5 }}>
                ⚠️ You have 3 DVDs on loan. Please return one before borrowing another.
              </div>
            ) : (
              <div style={{ background:'rgba(0,128,128,0.06)', border:'1px solid rgba(0,128,128,0.2)', borderRadius:'12px', padding:'0.85rem 1rem', fontSize:'0.88rem', color:'var(--text)', lineHeight:1.5 }}>
                💿 This DVD is available in the cinema. Ask a team member if you would like to borrow it.
              </div>
            )}

            {isAdmin && (
              <button onClick={()=>setConfirmDelete(true)} disabled={deleting}
                style={{ background:'none', border:'1px solid var(--danger)', borderRadius:'10px', color:'var(--danger)', fontSize:'0.82rem', fontWeight:600, padding:'0.55rem', cursor:deleting?'not-allowed':'pointer', width:'100%', opacity:deleting?0.5:1 }}>
                {deleting?'Removing...':'Remove from DVD library'}
              </button>
            )}
          </div>
        </div>
      </div>
      {confirmDelete && (
        <div onClick={()=>setConfirmDelete(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem' }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'var(--surface)', borderRadius:'16px', padding:'1.5rem', width:'100%', maxWidth:320 }}>
            <div style={{ fontWeight:700, marginBottom:'0.5rem' }}>Remove DVD?</div>
            <div style={{ fontSize:'0.88rem', color:'var(--text-dim)', marginBottom:'1.25rem', lineHeight:1.5 }}>Remove &quot;{movie.title}&quot; from the DVD library?</div>
            <div style={{ display:'flex', gap:'0.75rem' }}>
              <button onClick={()=>setConfirmDelete(false)} style={{ flex:1, padding:'0.75rem', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'10px', fontSize:'0.9rem', fontWeight:600, cursor:'pointer', color:'var(--text)' }}>Cancel</button>
              <button onClick={handleDelete} style={{ flex:1, padding:'0.75rem', background:'var(--danger)', border:'none', borderRadius:'10px', fontSize:'0.9rem', fontWeight:600, cursor:'pointer', color:'#fff' }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function DvdCard({ movie, activeLoan, onClick }) {
  const genres   = parseGenres(movie.genre)
  const leadActor = movie.actors ? movie.actors.split(',')[0].trim() : null
  return (
    <div onClick={onClick} style={{ background:'var(--surface)', borderRadius:'12px', border:'1px solid var(--border)', borderLeft:'3px solid ' + (activeLoan ? 'var(--text-dim)' : 'var(--teal)'), display:'flex', overflow:'hidden', boxShadow:'var(--shadow)', cursor:'pointer', minHeight:110, opacity: activeLoan ? 0.85 : 1 }}>
      {movie.poster_url
        ? <img src={movie.poster_url} alt={movie.title} style={{ width:75, objectFit:'cover', flexShrink:0 }} />
        : <div style={{ width:75, background:'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.8rem', flexShrink:0 }}>💿</div>}
      <div style={{ flex:1, padding:'0.75rem', display:'flex', flexDirection:'column', justifyContent:'center', gap:'0.3rem', overflow:'hidden' }}>
        <div style={{ fontWeight:700, fontSize:'0.9rem', lineHeight:1.2 }}>{movie.title}</div>
        {activeLoan ? (
          <div style={{ fontSize:'0.72rem', color:'var(--text-dim)', fontWeight:600 }}>
            📤 On loan — {activeLoan.members?.name || 'Resident'}
          </div>
        ) : (
          <>
            {leadActor && (
              <div style={{ fontSize:'0.75rem', color:'var(--text-dim)' }}>
                {leadActor}
                {movie.rating_imdb && <span style={{ color:'var(--amber-dark)', fontWeight:600 }}> ({movie.rating_imdb})</span>}
              </div>
            )}
            {!leadActor && movie.year && (
              <div style={{ fontSize:'0.75rem', color:'var(--text-dim)' }}>{movie.year}</div>
            )}
          </>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexWrap:'wrap', marginTop:'0.1rem' }}>
          {movie.rating && (
            <span style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'4px', padding:'0.1rem 0.35rem', fontSize:'0.68rem', fontWeight:700, color:'var(--text-dim)' }}>{movie.rating}</span>
          )}
          {!activeLoan && genres.slice(0,2).map(g=><span key={g} style={{ background:'var(--surface2)', borderRadius:'20px', padding:'0.1rem 0.4rem', fontSize:'0.68rem', color:'var(--text-dim)' }}>{g}</span>)}
        </div>
      </div>
    </div>
  )
}

export default function DvdPage() {
  const [movies,      setMovies]      = useState([])
  const [loans,       setLoans]       = useState([])   // active loans
  const [member,      setMember]      = useState(null)
  const [session,     setSession]     = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [sortBy,      setSortBy]      = useState('az')
  const [genreFilter, setGenreFilter] = useState('')
  const [selected,    setSelected]    = useState(null)
  const [toasts,      setToasts]      = useState([])

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

  // Build loans map keyed by movie_id
  const loansMap = Object.fromEntries(loans.map(l => [l.movie_id, l]))
  const myLoanCount = member ? loans.filter(l => l.member_id === member.id).length : 0

  const allGenres = [...new Set(movies.flatMap(m => parseGenres(m.genre)))].sort()

  const filtered = movies.filter(m => {
    const q = search.toLowerCase()
    const matchesSearch = !search
      || m.title.toLowerCase().includes(q)
      || (m.actors && m.actors.toLowerCase().includes(q))
    const matchesGenre = !genreFilter || parseGenres(m.genre).includes(genreFilter)
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
        <div style={{ background:'var(--surface)', borderRadius:'14px', padding:'1rem', marginBottom:'1rem', border:'1px solid var(--border)', borderLeft:'4px solid var(--teal)', fontSize:'0.88rem', lineHeight:1.6 }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:'0.6rem' }}>
            <span style={{ fontSize:'1.4rem', flexShrink:0 }}>💿</span>
            <div>
              <div style={{ fontWeight:700, color:'var(--teal)', fontSize:'0.8rem', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.2rem' }}>DVD Library</div>
              DVDs available in the cinema for residents to borrow. Tap a title to borrow or return.
              {myLoanCount > 0 && <span style={{ display:'block', marginTop:'0.25rem', fontWeight:600, color:'var(--teal)' }}>You have {myLoanCount} DVD{myLoanCount>1?'s':''} on loan.</span>}
            </div>
          </div>
        </div>

        <div style={{ marginBottom:'0.75rem' }}>
          <input
            placeholder="Search by title or actor..."
            value={search}
            onChange={e=>setSearch(e.target.value)}
            style={{ width:'100%', padding:'0.7rem 0.85rem', border:'1.5px solid var(--border)', borderRadius:'12px', fontSize:'0.9rem', background:'var(--surface)', boxSizing:'border-box', fontFamily:'inherit' }}
          />
        </div>

        {allGenres.length > 0 && (
          <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', marginBottom:'0.85rem' }}>
            <button onClick={()=>setGenreFilter('')}
              style={{ padding:'0.3rem 0.75rem', borderRadius:'20px', border:'1.5px solid', borderColor:!genreFilter?'var(--teal)':'var(--border)', background:!genreFilter?'var(--teal)':'var(--surface)', color:!genreFilter?'#fff':'var(--text)', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}>
              All
            </button>
            {allGenres.map(g => (
              <button key={g} onClick={()=>setGenreFilter(g===genreFilter?'':g)}
                style={{ padding:'0.3rem 0.75rem', borderRadius:'20px', border:'1.5px solid', borderColor:genreFilter===g?'var(--teal)':'var(--border)', background:genreFilter===g?'var(--teal)':'var(--surface)', color:genreFilter===g?'#fff':'var(--text)', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}>
                {g}
              </button>
            ))}
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
          <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--teal)', letterSpacing:'0.08em', textTransform:'uppercase' }}>
            {sorted.length} title{sorted.length!==1?'s':''}
          </div>
          <div style={{ display:'flex', gap:'0.4rem' }}>
            {[['az','A–Z'],['imdb','IMDb']].map(([k,l]) => (
              <button key={k} onClick={()=>setSortBy(k)}
                style={{ padding:'0.3rem 0.75rem', borderRadius:'10px', border:'1.5px solid', borderColor:sortBy===k?'var(--teal)':'var(--border)', background:sortBy===k?'var(--teal)':'var(--surface)', color:sortBy===k?'#fff':'var(--text)', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}>
                {l}
              </button>
            ))}
          </div>
        </div>

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
              <DvdCard key={m.id} movie={m} activeLoan={loansMap[m.id] || null} onClick={()=>setSelected(m.id)} />
            ))}
          </div>
        )}
      </div>

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
          onLoansChanged={()=>{ loadLoans() }}
          addToast={addToast}
        />
      )}
    </div>
  )
}
