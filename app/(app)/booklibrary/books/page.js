'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useOwners } from '@/lib/useOwners'
import ExpandableText from '@/components/ExpandableText'
import { useAdaptiveClamp } from '@/lib/useAdaptiveClamp'
import { resolveMemberName } from '@/lib/memberName'

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
function MyLoansSheet({ myLoans, books, onReturn, onClose, addToast }) {
  const [returning, setReturning] = useState(null)

  async function handleReturn(loan) {
    setReturning(loan.id)
    const { error } = await supabase.from('book_loans').update({ returned_at: new Date().toISOString() }).eq('id', loan.id)
    setReturning(null)
    if (error) { addToast('Could not return — ' + error.message, 'error'); return }
    const book = books.find(b => b.id === loan.book_id)
    addToast((book?.title || 'Book') + ' returned — thanks!')
    onReturn()
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center', paddingBottom:'60px' }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:640, background:'var(--surface)', borderRadius:'20px 20px 0 0', maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'0.6rem 1.25rem 0', display:'flex', justifyContent:'center' }}>
          <div style={{ width:40, height:4, background:'var(--border)', borderRadius:2 }} />
        </div>
        <div style={{ padding:'0.75rem 1.25rem 0.75rem', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ fontWeight:700, fontSize:'1rem' }}>📚 My Borrowed Books</div>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:'50%', background:'var(--surface2)', border:'none', fontSize:'1.1rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-dim)' }}>✕</button>
        </div>
        <div style={{ overflowY:'auto', flex:1, padding:'0.75rem 1.25rem 2rem' }}>
          {myLoans.length === 0 ? (
            <div style={{ textAlign:'center', color:'var(--text-dim)', padding:'2rem', fontSize:'0.9rem' }}>No books on loan</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
              {myLoans.map(loan => {
                const book = books.find(b => b.id === loan.book_id)
                if (!book) return null
                return (
                  <div key={loan.id} style={{ display:'flex', alignItems:'center', gap:'0.75rem', background:'var(--surface2)', borderRadius:'12px', padding:'0.75rem', border:'1px solid var(--border)' }}>
                    {book.cover_url
                      ? <img src={book.cover_url} alt={book.title} style={{ width:46, height:68, objectFit:'cover', borderRadius:6, flexShrink:0 }} />
                      : <div style={{ width:46, height:68, background:'var(--surface)', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.4rem', flexShrink:0 }}>📖</div>}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:'0.92rem', lineHeight:1.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{book.title}</div>
                      <div style={{ fontSize:'0.75rem', color:'var(--text-dim)', marginTop:'0.2rem' }}>Borrowed {fmtDate(loan.borrowed_at)}</div>
                    </div>
                    <button onClick={() => handleReturn(loan)} disabled={returning === loan.id}
                      style={{ flexShrink:0, background:'var(--purple)', color:'#fff', border:'none', borderRadius:'10px', padding:'0.55rem 1rem', fontSize:'0.82rem', fontWeight:700, cursor:returning===loan.id?'not-allowed':'pointer', opacity:returning===loan.id?0.6:1, whiteSpace:'nowrap' }}>
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

// ── Book Detail sheet ─────────────────────────────────────────────────────────
function BookDetailSheet({ book, isAdmin, canManage, session, memberId, myLoanCount, loanCap, activeLoan, onClose, onDeleted, onLoansChanged, addToast }) {
  const [deleting,      setDeleting]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [borrowing,     setBorrowing]     = useState(false)
  const [returning,     setReturning]     = useState(false)
  const [showNotes,     setShowNotes]     = useState(false)
  const genres = parseGenres(book.genre)

  const iMineToReturn = activeLoan && activeLoan.member_id === memberId
  // display_name (2026-08-15): this borrower badge is shown to EVERY
  // resident browsing the library, not just admins -- and it was never
  // wired into either Display Name OR the existing hide_name ("Private")
  // masking at all (the query didn't even select hide_name). Routed through
  // resolveMemberName now so a Private resident's real name doesn't leak
  // here, and everyone else sees Display Name, same as Contacts/Attendees.
  const activeLoanName = activeLoan
    ? (iMineToReturn ? 'You' : resolveMemberName(activeLoan.members, { canManage: isAdmin, fallback: 'Resident' }))
    : null
  const canBorrow      = !activeLoan && myLoanCount < loanCap

  // Clamp the summary only as far as the sheet's own maxHeight forces --
  // a short blurb that fits in full shows in full, no Read more; a long
  // one clamps to whatever's left after everything else in the sheet.
  // See lib/useAdaptiveClamp.js for the measurement approach.
  const sheetRef = useRef(null)
  const bodyRef = useRef(null)
  const summaryWrapRef = useRef(null)
  const summaryMaxLines = useAdaptiveClamp(sheetRef, bodyRef, summaryWrapRef, { fontSize: 13, lineHeight: 1.6 }, [book.id, book.summary])

  async function handleBorrow() {
    if (!memberId) { addToast('Sign in to borrow books', 'error'); return }
    setBorrowing(true)
    const { error } = await supabase.from('book_loans').insert({ book_id: book.id, member_id: memberId })
    setBorrowing(false)
    if (error) { addToast('Could not borrow — ' + error.message, 'error'); return }
    addToast('Borrowed! Enjoy ' + book.title)
    onLoansChanged()
  }

  async function handleReturn() {
    setReturning(true)
    const { error } = await supabase.from('book_loans').update({ returned_at: new Date().toISOString() }).eq('id', activeLoan.id)
    setReturning(false)
    if (error) { addToast('Could not return — ' + error.message, 'error'); return }
    addToast(book.title + ' returned — thanks!')
    onLoansChanged()
  }

  async function handleDelete() {
    setConfirmDelete(false); setDeleting(true)
    const res = await fetch('/api/books/' + book.id, { method:'DELETE', headers:{ 'Authorization':'Bearer ' + session?.access_token } })
    setDeleting(false)
    if (!res.ok) { const d=await res.json().catch(()=>({})); addToast(d.error||'Delete failed','error'); return }
    addToast(book.title + ' removed'); onClose(); onDeleted()
  }

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center', paddingBottom:'60px' }}>
        <div ref={sheetRef} onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:640, background:'var(--surface)', borderRadius:'20px 20px 0 0', maxHeight:'calc(92vh - 60px)', display:'flex', flexDirection:'column' }}>

          <div style={{ flexShrink:0 }}>
            <div style={{ padding:'0.6rem 1.25rem 0', display:'flex', justifyContent:'center' }}>
              <div style={{ width:40, height:4, background:'var(--border)', borderRadius:2 }} />
            </div>
            <div style={{ padding:'0.6rem 1.25rem 0.6rem', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--border)' }}>
              <div style={{ fontWeight:800, fontSize:'1rem', lineHeight:1.2, flex:1, marginRight:'0.75rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{book.title}</div>
              <button onClick={onClose} style={{ flexShrink:0, width:34, height:34, borderRadius:'50%', background:'var(--surface2)', border:'1px solid var(--border)', fontSize:'1rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-dim)', fontWeight:700 }}>✕</button>
            </div>
          </div>

          <div ref={bodyRef} style={{ overflowY:'auto', flex:1 }}>
            {book.cover_url && (
              // overflow:hidden moved onto an inner wrapper around just the
              // blurred banner image (2026-08-13) -- it was on this outer
              // relative box, which clipped the thumbnail's intended -40px
              // overlap into the info section below along with it. Verified
              // live: the thumbnail's own box extended 40px past the banner
              // as coded, but was invisible because the shared ancestor cut
              // it off, leaving a dead white gap above the author line
              // instead of the thumbnail visibly hanging over the boundary.
              <div style={{ position:'relative', height:180 }}>
                <div style={{ position:'absolute', inset:0, overflow:'hidden' }}>
                  <img src={book.cover_url} alt={book.title} style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'top', filter:'blur(2px) brightness(0.6)', transform:'scale(1.05)' }} />
                </div>
                <img src={book.cover_url} alt={book.title} style={{ position:'absolute', left:'1.25rem', bottom:'-40px', width:80, height:120, objectFit:'cover', borderRadius:8, boxShadow:'0 4px 16px rgba(0,0,0,0.4)' }} />
              </div>
            )}

            {/* Bottom padding trimmed to 1rem (was 2.5rem) — that space was
                sized for the Borrow button when it lived in this scrollable
                area; now that it's in its own sticky footer below, the old
                padding was just dead space between the description and the
                footer's border (measured live on the deployed preview,
                2026-08-13: 48px top + 40px bottom padding against ~144px of
                actual content). */}
            <div style={{ position:'relative', padding:book.cover_url?'3rem 1.25rem 1rem':'1.25rem 1.25rem 1rem', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
              {activeLoan && (
                <div style={{ position:'absolute', top:'0.75rem', right:'1.25rem' }}>
                  <div style={{ background:iMineToReturn?'var(--purple)':'var(--surface2)', border:'1px solid ' + (iMineToReturn?'var(--purple)':'var(--border)'), borderRadius:'10px', padding:'0.4rem 0.65rem', textAlign:'center' }}>
                    <div style={{ fontSize:'0.65rem', fontWeight:800, color:iMineToReturn?'#fff':'var(--text)', textTransform:'uppercase', letterSpacing:'0.05em', lineHeight:1.2 }}>
                      📚 On Loan
                    </div>
                    <div style={{ fontSize:'0.6rem', color:iMineToReturn?'rgba(255,255,255,0.85)':'var(--text-dim)', marginTop:'0.2rem', lineHeight:1.3, whiteSpace:'nowrap' }}>
                      {activeLoanName} · {fmtDate(activeLoan.borrowed_at)}
                    </div>
                  </div>
                </div>
              )}
              {!book.cover_url && activeLoan && (
                <div style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem', background:iMineToReturn?'var(--purple)':'var(--surface2)', borderRadius:'10px', padding:'0.5rem 0.85rem', alignSelf:'flex-start', border:'1px solid ' + (iMineToReturn?'var(--purple)':'var(--border)') }}>
                  <span style={{ fontSize:'1rem' }}>{iMineToReturn?'📚':'📤'}</span>
                  <div>
                    <div style={{ fontSize:'0.72rem', fontWeight:800, color:iMineToReturn?'#fff':'var(--text)', textTransform:'uppercase', letterSpacing:'0.04em' }}>On Loan</div>
                    <div style={{ fontSize:'0.68rem', color:iMineToReturn?'rgba(255,255,255,0.85)':'var(--text-dim)' }}>
                      {activeLoanName} · {fmtDate(activeLoan.borrowed_at)}
                    </div>
                  </div>
                </div>
              )}

              {(book.author || book.published_year || canManage) && (
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'0.75rem' }}>
                  <div style={{ color:'var(--text-dim)', fontSize:'0.85rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {book.author}{book.author && book.published_year ? ' · ' : ''}{book.published_year}
                  </div>
                  {canManage && (
                    <button onClick={() => setConfirmDelete(true)} disabled={deleting}
                      style={{ flexShrink:0, display:'flex', alignItems:'center', gap:'0.3rem', background:'none', border:'1px solid var(--danger)', borderRadius:'8px', padding:'0.3rem 0.6rem', fontSize:'0.68rem', fontWeight:700, color:'var(--danger)', cursor:deleting?'not-allowed':'pointer', opacity:deleting?0.5:1, whiteSpace:'nowrap' }}>
                      🗑 {deleting ? 'Removing…' : 'Remove'}
                    </button>
                  )}
                </div>
              )}

              {(book.isbn || book.publisher || book.notes) && (
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginTop:'-0.4rem', flexWrap:'wrap' }}>
                  {book.isbn && <span title="ISBN" style={{ fontSize:'0.72rem', color:'var(--text-dim)', opacity:0.75, fontFamily:'monospace' }}>{book.isbn}</span>}
                  {book.isbn && book.publisher && <span style={{ fontSize:'0.72rem', color:'var(--text-dim)', opacity:0.5 }}>·</span>}
                  {book.publisher && <span style={{ fontSize:'0.72rem', color:'var(--text-dim)', opacity:0.75 }}>{book.publisher}</span>}
                  {book.notes && (
                    <button onClick={() => setShowNotes(true)}
                      style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'20px', padding:'0.1rem 0.55rem', fontSize:'0.68rem', fontWeight:600, color:'var(--purple)', cursor:'pointer' }}>
                      Notes
                    </button>
                  )}
                </div>
              )}

              {genres.length > 0 && <GenreChips genres={genres} />}

              {book.rating && (
                <div style={{ display:'flex', gap:'0.75rem', alignItems:'center', flexWrap:'wrap' }}>
                  {book.rating_link
                    ? <a href={book.rating_link} target="_blank" rel="noopener noreferrer" style={{ fontSize:'0.88rem', fontWeight:700, color:'var(--amber-dark)', textDecoration:'none' }}>⭐ {book.rating}</a>
                    : <span style={{ fontSize:'0.88rem', fontWeight:700, color:'var(--amber-dark)' }}>⭐ {book.rating}</span>}
                </div>
              )}

              {/* Google Books descriptions come with real HTML markup
                  (<p>, <b>, <i>) baked in -- same dangerouslySetInnerHTML
                  trust model already used for Page Texts/notices elsewhere
                  in this app -- Google's catalogue copy, not user input.
                  Clamp is computed dynamically (2026-08-13, useAdaptiveClamp)
                  against the sheet's own maxHeight, not a fixed line count:
                  a summary that fits in full shows in full with no Read
                  more; only once the sheet would exceed its max height does
                  it clamp, and only by as much as it needs to. */}
              {book.summary && (
                <div ref={summaryWrapRef}>
                  <ExpandableText text={book.summary} html fontSize={13} lineHeight={1.6} maxLines={summaryMaxLines} colour="var(--purple)" />
                </div>
              )}
            </div>
          </div>

          {/* Sticky action footer -- outside the scrollable body, so Borrow/
              Return/loan-cap-warning stays reachable regardless of how far
              the description or genre list scrolls. Mirrors the Sheet
              component's sticky footer pattern used elsewhere in the app
              (ResidentEditPanel) for the same "never hunt for the button"
              reason. */}
          {(iMineToReturn || canBorrow || (!activeLoan && myLoanCount >= loanCap)) && (
            <div style={{ flexShrink:0, padding:'0.85rem 1.25rem', borderTop:'1px solid var(--border)', background:'var(--surface)' }}>
              {iMineToReturn ? (
                <button onClick={handleReturn} disabled={returning}
                  style={{ background:'var(--purple)', color:'#fff', border:'none', borderRadius:'10px', padding:'0.9rem', fontSize:'0.95rem', fontWeight:700, cursor:returning?'not-allowed':'pointer', opacity:returning?0.6:1, width:'100%' }}>
                  {returning ? 'Returning…' : '↩ Return this book'}
                </button>
              ) : canBorrow ? (
                <button onClick={handleBorrow} disabled={borrowing || !memberId}
                  style={{ background:'var(--purple)', color:'#fff', border:'none', borderRadius:'10px', padding:'0.9rem', fontSize:'0.95rem', fontWeight:700, cursor:(borrowing||!memberId)?'not-allowed':'pointer', opacity:(borrowing||!memberId)?0.6:1, width:'100%' }}>
                  {borrowing ? 'Borrowing…' : '📚 Borrow this book'}
                </button>
              ) : !activeLoan && myLoanCount >= loanCap ? (
                <div style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:'10px', padding:'0.75rem 1rem', fontSize:'0.85rem', color:'var(--text)', textAlign:'center' }}>
                  ⚠️ You have {loanCap} book{loanCap!==1?'s':''} on loan — return one first.
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div onClick={() => setConfirmDelete(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem' }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'var(--surface)', borderRadius:'16px', padding:'1.5rem', width:'100%', maxWidth:320 }}>
            <div style={{ fontWeight:700, marginBottom:'0.5rem' }}>Remove book?</div>
            <div style={{ fontSize:'0.88rem', color:'var(--text-dim)', marginBottom:'1.25rem', lineHeight:1.5 }}>Remove &quot;{book.title}&quot; from the Book Library?</div>
            <div style={{ display:'flex', gap:'0.75rem' }}>
              <button onClick={() => setConfirmDelete(false)} style={{ flex:1, padding:'0.75rem', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'10px', fontSize:'0.9rem', fontWeight:600, cursor:'pointer', color:'var(--text)' }}>Cancel</button>
              <button onClick={handleDelete} style={{ flex:1, padding:'0.75rem', background:'var(--danger)', border:'none', borderRadius:'10px', fontSize:'0.9rem', fontWeight:600, cursor:'pointer', color:'#fff' }}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {showNotes && (
        <div onClick={() => setShowNotes(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem' }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'var(--surface)', borderRadius:'16px', padding:'1.5rem', width:'100%', maxWidth:360 }}>
            <div style={{ fontWeight:700, marginBottom:'0.75rem' }}>Notes</div>
            <div style={{ fontSize:'0.88rem', color:'var(--text)', marginBottom:'1.25rem', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{book.notes}</div>
            <button onClick={() => setShowNotes(false)} style={{ width:'100%', padding:'0.75rem', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'10px', fontSize:'0.9rem', fontWeight:600, cursor:'pointer', color:'var(--text)' }}>Close</button>
          </div>
        </div>
      )}
    </>
  )
}

// ── Book Card ──────────────────────────────────────────────────────────────────
function BookCard({ book, activeLoan, myLoan, onClick }) {
  const genres = parseGenres(book.genre)

  const loanBadge = myLoan
    ? { label:'On Loan', sub:'Tap to return', bg:'var(--purple)', color:'#fff' }
    : activeLoan
    ? { label:'On Loan', sub:'Unavailable', bg:'var(--surface2)', color:'var(--text-dim)' }
    : null

  return (
    <div onClick={onClick} style={{ background:'var(--surface)', borderRadius:'12px', border:'1px solid var(--border)', borderLeft:'3px solid ' + (myLoan ? 'var(--purple)' : activeLoan ? 'var(--border)' : 'var(--purple)'), display:'flex', overflow:'hidden', boxShadow:'var(--shadow)', cursor:'pointer', minHeight:110, opacity:activeLoan && !myLoan ? 0.75 : 1 }}>
      {book.cover_url
        ? <img src={book.cover_url} alt={book.title} style={{ width:75, objectFit:'cover', flexShrink:0 }} />
        : <div style={{ width:75, background:'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.8rem', flexShrink:0 }}>📖</div>}

      <div style={{ flex:1, padding:'0.75rem', display:'flex', flexDirection:'column', justifyContent:'center', gap:'0.3rem', overflow:'hidden', minWidth:0 }}>
        <div style={{ fontWeight:700, fontSize:'0.9rem', lineHeight:1.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{book.title}</div>
        {book.author && (
          <div style={{ fontSize:'0.75rem', color:'var(--text-dim)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {book.author}
            {book.rating && !activeLoan && <span style={{ color:'var(--amber-dark)', fontWeight:600 }}> · ⭐{book.rating}</span>}
          </div>
        )}
        {!book.author && book.published_year && <div style={{ fontSize:'0.75rem', color:'var(--text-dim)' }}>{book.published_year}</div>}
        {!activeLoan && genres.length > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:'0.3rem', flexWrap:'wrap', marginTop:'0.1rem' }}>
            {genres.slice(0,2).map(g=><span key={g} style={{ background:'var(--surface2)', borderRadius:'20px', padding:'0.1rem 0.4rem', fontSize:'0.65rem', color:'var(--text-dim)' }}>{g}</span>)}
          </div>
        )}
      </div>

      {loanBadge && (
        <div style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'0.75rem 0.85rem', gap:'0.25rem', minWidth:72 }}>
          <div style={{ background:loanBadge.bg, color:loanBadge.color, borderRadius:'10px', padding:'0.35rem 0.55rem', textAlign:'center' }}>
            <div style={{ fontSize:'1.25rem', lineHeight:1 }}>📚</div>
            <div style={{ fontSize:'0.6rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.04em', marginTop:'0.2rem', lineHeight:1.1 }}>{loanBadge.label}</div>
          </div>
          <div style={{ fontSize:'0.6rem', color:'var(--text-dim)', textAlign:'center', lineHeight:1.2 }}>{loanBadge.sub}</div>
        </div>
      )}
    </div>
  )
}

// ── Add Book Sheet (admin/owner only) ──────────────────────────────────────────
function AddBookSheet({ session, onAdded, onClose, addToast }) {
  const [mode,        setMode]        = useState('barcode') // 'title' | 'barcode' — Iain, 2026-08-13: barcode is manual entry, no camera scan for now. Default + left-most (2026-08-13): barcode is the fast path for adding a physical copy in hand; title search is the deliberate opt-in.
  const [search,      setSearch]      = useState('')
  const [barcode,     setBarcode]     = useState('')
  const [results,     setResults]     = useState([])
  const [searching,   setSearching]   = useState(false)
  const [barcodeError,setBarcodeError]= useState('')
  const [selected,    setSelected]    = useState(null)
  const [adding,      setAdding]      = useState(false)
  const [isDuplicate, setIsDuplicate] = useState(false)

  function switchMode(next) {
    setMode(next); setSearch(''); setBarcode(''); setResults([]); setSelected(null); setIsDuplicate(false); setBarcodeError('')
  }

  async function doSearch(q) {
    setSearch(q); setSelected(null); setIsDuplicate(false)
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    const res = await fetch('/api/books/search?q=' + encodeURIComponent(q))
    const data = await res.json()
    setResults(data.results || [])
    setSearching(false)
  }

  // Barcode mode: NOT live search-as-you-type — the number must be entered
  // in full and this only fires on an explicit button click (Iain,
  // 2026-08-13: "must be entered in its entirety with a specific search
  // button being clicked... Simple enough for now").
  async function doBarcodeSearch() {
    setSelected(null); setIsDuplicate(false); setBarcodeError('')
    if (!barcode.trim()) return
    setSearching(true)
    const res = await fetch('/api/books/search?isbn=' + encodeURIComponent(barcode.trim()))
    const data = await res.json()
    setSearching(false)
    if (data.error === 'invalid_isbn') { setBarcodeError('Enter a full 10 or 13-digit ISBN'); setResults([]); return }
    if (!data.results?.length) { setBarcodeError('No book found for that barcode'); setResults([]); return }
    setResults(data.results)
  }

  async function handleSelect(r) {
    setSelected(r)
    if (mode === 'title') setSearch(r.title)
    setResults([])
    setIsDuplicate(false)
    const { data } = await supabase.from('books').select('id').eq('we_own', true).eq('google_books_id', r.google_books_id).maybeSingle()
    setIsDuplicate(!!data)
  }

  async function handleAdd() {
    if (!selected) return
    setAdding(true)
    const res = await fetch('/api/admin/book-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session?.access_token },
      body: JSON.stringify({ google_books_id: selected.google_books_id }),
    })
    const data = await res.json()
    setAdding(false)
    if (!res.ok) { addToast(data.error || 'Add failed', 'error'); return }
    addToast(data.title + ' added to the Book Library')
    onAdded()
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center', paddingBottom:'60px' }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:640, background:'var(--surface)', borderRadius:'20px 20px 0 0', height:'calc(92vh - 60px)', maxHeight:'calc(92vh - 60px)', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'0.6rem 1.25rem 0', display:'flex', justifyContent:'center' }}>
          <div style={{ width:40, height:4, background:'var(--border)', borderRadius:2 }} />
        </div>
        <div style={{ padding:'0.6rem 1.25rem 0.75rem', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ fontWeight:700, fontSize:'1rem' }}>➕ Add Book to Library</div>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:'50%', background:'var(--surface2)', border:'none', fontSize:'1.1rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-dim)' }}>✕</button>
        </div>
        <div style={{ padding:'1rem 1.25rem 2rem', overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:'0.75rem' }}>
          <div style={{ display:'flex', gap:'0.4rem', background:'var(--surface2)', borderRadius:'10px', padding:'0.25rem' }}>
            <button onClick={() => switchMode('barcode')}
              style={{ flex:1, padding:'0.5rem', borderRadius:'8px', border:'none', fontSize:'0.85rem', fontWeight:700, cursor:'pointer', background:mode==='barcode'?'var(--surface)':'transparent', color:mode==='barcode'?'var(--purple)':'var(--text-dim)', boxShadow:mode==='barcode'?'0 1px 3px rgba(0,0,0,0.1)':'none' }}>
              Barcode / ISBN
            </button>
            <button onClick={() => switchMode('title')}
              style={{ flex:1, padding:'0.5rem', borderRadius:'8px', border:'none', fontSize:'0.85rem', fontWeight:700, cursor:'pointer', background:mode==='title'?'var(--surface)':'transparent', color:mode==='title'?'var(--purple)':'var(--text-dim)', boxShadow:mode==='title'?'0 1px 3px rgba(0,0,0,0.1)':'none' }}>
              Search by Title
            </button>
          </div>

          {mode === 'title' ? (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
              {/* 2026-08-25 fix: Title search already ran live-as-you-type
                  via onChange, but had no visible "do this to search"
                  affordance the way Barcode/ISBN mode does -- Iain flagged
                  typing a single letter looked broken with no way to
                  trigger anything. Root cause was twofold: (1) the server
                  (app/api/books/search) silently returns zero results for
                  anything under 2 characters with no explanation, and (2)
                  this tab had no button at all, unlike the other tab, so
                  there was nothing to click even if a resident didn't
                  trust/notice the type-ahead behaviour. Added a matching
                  Search button (same layout as Barcode mode) that
                  re-triggers the same search explicitly, plus a short hint
                  for the sub-2-character case -- live search-as-you-type is
                  kept, this is additive parity, not a replacement. */}
              <div style={{ position:'relative', display:'flex', gap:'0.5rem' }}>
                <input value={search} onChange={e => doSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') doSearch(search) }}
                  placeholder="Search book title…"
                  style={{ flex:1, padding:'0.7rem 0.85rem', border:'1.5px solid var(--border)', borderRadius:'12px', fontSize:'0.9rem', background:'var(--surface)', boxSizing:'border-box', fontFamily:'inherit' }} />
                <button onClick={() => doSearch(search)} disabled={searching || search.trim().length < 2}
                  style={{ flexShrink:0, padding:'0 1.1rem', background:'var(--purple)', color:'#fff', border:'none', borderRadius:'12px', fontSize:'0.9rem', fontWeight:700, cursor:(searching||search.trim().length<2)?'not-allowed':'pointer', opacity:(searching||search.trim().length<2)?0.5:1 }}>
                  {searching ? '…' : 'Search'}
                </button>
              </div>
              {search.trim().length === 1 && (
                <div style={{ fontSize:'0.8rem', color:'var(--text-dim)' }}>Type at least 2 characters to search</div>
              )}
              {results.length > 0 && !selected && (
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', zIndex:50, overflow:'hidden', boxShadow:'0 4px 16px rgba(0,0,0,0.2)' }}>
                  {results.map(r => (
                    <div key={r.google_books_id} onClick={() => handleSelect(r)}
                      style={{ display:'flex', alignItems:'center', gap:'0.65rem', padding:'0.65rem 0.85rem', cursor:'pointer', borderBottom:'1px solid var(--border)' }}>
                      {r.cover_url ? <img src={r.cover_url} alt={r.title} style={{ width:32, height:46, objectFit:'cover', borderRadius:4 }} /> : <div style={{ width:32, height:46, background:'var(--surface2)', borderRadius:4 }} />}
                      <div>
                        <div style={{ fontWeight:700, fontSize:'0.9rem' }}>{r.title}</div>
                        {r.author && <div style={{ fontSize:'0.75rem', color:'var(--text-dim)' }}>{r.author}</div>}
                        {r.rating && <div style={{ fontSize:'0.75rem', color:'var(--amber-dark)', fontWeight:600 }}>⭐ {r.rating}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
              <div style={{ display:'flex', gap:'0.5rem' }}>
                <input value={barcode} onChange={e => { setBarcode(e.target.value); setBarcodeError('') }}
                  onKeyDown={e => { if (e.key === 'Enter') doBarcodeSearch() }}
                  inputMode="numeric" placeholder="Enter full ISBN / barcode number…"
                  style={{ flex:1, padding:'0.7rem 0.85rem', border:'1.5px solid var(--border)', borderRadius:'12px', fontSize:'0.9rem', background:'var(--surface)', boxSizing:'border-box', fontFamily:'inherit' }} />
                <button onClick={doBarcodeSearch} disabled={searching || !barcode.trim()}
                  style={{ flexShrink:0, padding:'0 1.1rem', background:'var(--purple)', color:'#fff', border:'none', borderRadius:'12px', fontSize:'0.9rem', fontWeight:700, cursor:(searching||!barcode.trim())?'not-allowed':'pointer', opacity:(searching||!barcode.trim())?0.5:1 }}>
                  {searching ? '…' : 'Search'}
                </button>
              </div>
              {barcodeError && <div style={{ fontSize:'0.8rem', color:'var(--danger)' }}>{barcodeError}</div>}
              {results.length > 0 && !selected && (
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', overflow:'hidden' }}>
                  {results.map(r => (
                    <div key={r.google_books_id} onClick={() => handleSelect(r)}
                      style={{ display:'flex', alignItems:'center', gap:'0.65rem', padding:'0.65rem 0.85rem', cursor:'pointer', borderBottom:'1px solid var(--border)' }}>
                      {r.cover_url ? <img src={r.cover_url} alt={r.title} style={{ width:32, height:46, objectFit:'cover', borderRadius:4 }} /> : <div style={{ width:32, height:46, background:'var(--surface2)', borderRadius:4 }} />}
                      <div>
                        <div style={{ fontWeight:700, fontSize:'0.9rem' }}>{r.title}</div>
                        {r.author && <div style={{ fontSize:'0.75rem', color:'var(--text-dim)' }}>{r.author}</div>}
                        {r.rating && <div style={{ fontSize:'0.75rem', color:'var(--amber-dark)', fontWeight:600 }}>⭐ {r.rating}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {selected && (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', background:'var(--surface2)', borderRadius:'12px', padding:'0.75rem', border:`1px solid ${isDuplicate ? 'var(--danger)' : 'var(--purple)'}` }}>
                {selected.cover_url ? <img src={selected.cover_url} alt={selected.title} style={{ width:46, height:68, objectFit:'cover', borderRadius:6 }} /> : <div style={{ width:46, height:68, background:'var(--surface)', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.5rem' }}>📖</div>}
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:'0.95rem' }}>{selected.title}</div>
                  {selected.author && <div style={{ fontSize:'0.8rem', color:'var(--text-dim)' }}>{selected.author}</div>}
                  {selected.rating && <div style={{ fontSize:'0.8rem', color:'var(--amber-dark)', fontWeight:600 }}>⭐ {selected.rating}</div>}
                </div>
                {isDuplicate && <span style={{ fontSize:'1.25rem' }}>⚠️</span>}
              </div>
              {isDuplicate && (
                <div style={{ background:'#fef3c7', border:'1px solid #d97706', borderRadius:'10px', padding:'0.6rem 0.85rem', fontSize:'0.83rem', fontWeight:600, color:'#92400e' }}>
                  Already in the Book Library — no need to add it again.
                </div>
              )}
            </div>
          )}
          <button onClick={handleAdd} disabled={!selected || adding || isDuplicate}
            style={{ background:'var(--purple)', color:'#fff', border:'none', borderRadius:'12px', padding:'0.9rem', fontSize:'0.95rem', fontWeight:700, cursor:(!selected||adding||isDuplicate)?'not-allowed':'pointer', opacity:(!selected||adding||isDuplicate)?0.5:1 }}>
            {adding ? 'Adding to Library…' : '📚 Add to Book Library'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BookLibraryPage() {
  const [books,         setBooks]         = useState([])
  const [loans,         setLoans]         = useState([])
  const [member,        setMember]        = useState(null)
  const [session,       setSession]       = useState(null)
  const [loanCap,       setLoanCap]       = useState(3)
  const [infoText,      setInfoText]      = useState('Books available for residents to borrow. Tap a title to borrow or return.')
  const [loading,       setLoading]       = useState(true)
  const [search,        setSearch]        = useState('')
  const [sortBy,        setSortBy]        = useState('az')
  const [genreFilter,   setGenreFilter]   = useState('')
  const [filterExpanded,setFilterExpanded]= useState(false)
  const [selected,      setSelected]      = useState(null)
  const [showMyLoans,   setShowMyLoans]   = useState(false)
  const [showAddBook,   setShowAddBook]   = useState(false)
  const [toasts,        setToasts]        = useState([])
  const { owners: libraryOwners } = useOwners('hub', 'library')

  function addToast(message, type='success') {
    const id = Date.now()
    setToasts(prev=>[...prev,{id,message,type}])
    setTimeout(()=>setToasts(prev=>prev.filter(t=>t.id!==id)),4000)
  }

  const loadLoans = useCallback(async () => {
    const { data } = await supabase
      .from('book_loans')
      .select('id, book_id, member_id, borrowed_at, members(name, display_name, hide_name)')
      .is('returned_at', null)
    setLoans(data || [])
  }, [])

  const loadData = useCallback(async () => {
    const { data } = await supabase.from('books').select('*').eq('we_own', true).order('title')
    setBooks(data || [])
    setLoading(false)
  }, [])

  const loadHubSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/hub-settings')
      const data = await res.json()
      setLoanCap(data?.library_books?.loanCap ?? 3)
      if (data?.library_books?.text) setInfoText(data.library_books.text)
    } catch { /* keep defaults */ }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data:{ session:s } }) => {
      setSession(s)
      if (s) supabase.from('members').select('id, is_admin').eq('auth_id', s.user.id).single().then(({ data }) => setMember(data))
    })
    loadData()
    loadLoans()
    loadHubSettings()
  }, [loadData, loadLoans, loadHubSettings])

  const loansMap    = Object.fromEntries(loans.map(l => [l.book_id, l]))
  const myLoanCount = member ? loans.filter(l => l.member_id === member.id).length : 0
  const myLoans      = member ? loans.filter(l => l.member_id === member.id) : []

  const allGenres = [...new Set(books.flatMap(b => parseGenres(b.genre)))].sort()

  const filtered = books.filter(b => {
    const q = search.toLowerCase()
    const matchesSearch = !search || b.title.toLowerCase().includes(q) || (b.author && b.author.toLowerCase().includes(q))
    const matchesGenre  = !genreFilter || parseGenres(b.genre).includes(genreFilter)
    return matchesSearch && matchesGenre
  })

  const sorted = [...filtered].sort((a, b) =>
    sortBy === 'rating' ? (parseFloat(b.rating)||0) - (parseFloat(a.rating)||0) : a.title.localeCompare(b.title)
  )

  const selectedBook = selected ? books.find(b => b.id === selected) : null

  // Owner self-service model shipped 2026-08-12 (Owner_SelfService_and_
  // Library_Hub_Scope_v1, Part A.3) — an admin or this hub's Owner can
  // Add/Delete here, matching the API routes' existing Owner scoping
  // (requireAdminOrAreaOwner('hub', 'library')).
  const canManage = !!member?.is_admin || (!!member?.id && libraryOwners.some(o => o.id === member.id))

  return (
    <div style={{ background:'var(--bg)', minHeight:'100vh' }}>
      <Toast toasts={toasts} />
      <div style={{ padding:'1rem 1rem 6rem' }}>

        {myLoanCount > 0 && (
          <button onClick={() => setShowMyLoans(true)}
            style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--purple)', color:'#fff', border:'none', borderRadius:'14px', padding:'0.85rem 1.1rem', marginBottom:'1rem', cursor:'pointer', boxShadow:'0 2px 8px rgba(124,58,237,0.25)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.65rem' }}>
              <span style={{ fontSize:'1.5rem' }}>📚</span>
              <div style={{ textAlign:'left' }}>
                <div style={{ fontWeight:700, fontSize:'0.92rem' }}>You have {myLoanCount} book{myLoanCount>1?'s':''} on loan</div>
                <div style={{ fontSize:'0.75rem', opacity:0.88 }}>Tap to view &amp; return</div>
              </div>
            </div>
            <span style={{ fontSize:'1.3rem', opacity:0.9 }}>›</span>
          </button>
        )}

        <div style={{ background:'var(--surface)', borderRadius:'14px', padding:'1rem', marginBottom:'1rem', border:'1px solid var(--border)', borderLeft:'4px solid var(--purple)', fontSize:'0.88rem', lineHeight:1.6 }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:'0.6rem' }}>
            <span style={{ fontSize:'1.4rem', flexShrink:0 }}>📚</span>
            <div>
              <div style={{ fontWeight:700, color:'var(--purple)', fontSize:'0.8rem', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.2rem' }}>Book Library</div>
              <span dangerouslySetInnerHTML={{ __html: infoText }} />
            </div>
          </div>
        </div>

        <div style={{ marginBottom:'0.75rem' }}>
          <input placeholder="Search by title or author..." value={search} onChange={e=>setSearch(e.target.value)}
            style={{ width:'100%', padding:'0.7rem 0.85rem', border:'1.5px solid var(--border)', borderRadius:'12px', fontSize:'0.9rem', background:'var(--surface)', boxSizing:'border-box', fontFamily:'inherit' }} />
        </div>

        {(() => {
          const VISIBLE = 8
          const btnStyle = (active) => ({ padding:'0.3rem 0.75rem', borderRadius:'20px', border:'1.5px solid', borderColor:active?'var(--purple)':'var(--border)', background:active?'var(--purple)':'var(--surface)', color:active?'#fff':'var(--text)', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' })
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

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
          <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--purple)', letterSpacing:'0.08em', textTransform:'uppercase' }}>
            {sorted.length} title{sorted.length!==1?'s':''}
          </div>
          <div style={{ display:'flex', gap:'0.4rem', alignItems:'center' }}>
            {canManage && (
              <button onClick={() => setShowAddBook(true)}
                style={{ padding:'0.3rem 0.75rem', borderRadius:'10px', border:'1.5px solid var(--purple)', background:'var(--purple)', color:'#fff', fontSize:'0.75rem', fontWeight:700, cursor:'pointer' }}>
                + Add Book
              </button>
            )}
            {[['az','A–Z'],['rating','Rating']].map(([k,l]) => (
              <button key={k} onClick={()=>setSortBy(k)}
                style={{ padding:'0.3rem 0.75rem', borderRadius:'10px', border:'1.5px solid', borderColor:sortBy===k?'var(--purple)':'var(--border)', background:sortBy===k?'var(--purple)':'var(--surface)', color:sortBy===k?'#fff':'var(--text)', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:'3rem' }}><div className="spinner" /></div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign:'center', color:'var(--text-dim)', padding:'3rem' }}>
            <div style={{ fontSize:'2.5rem', marginBottom:'0.75rem' }}>📚</div>
            <div style={{ fontSize:'0.9rem', fontWeight:600 }}>{search || genreFilter ? 'No books match your search' : 'No books in the library yet'}</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.65rem' }}>
            {sorted.map(b => (
              <BookCard
                key={b.id}
                book={b}
                activeLoan={loansMap[b.id] || null}
                myLoan={loansMap[b.id] && member && loansMap[b.id].member_id === member.id ? loansMap[b.id] : null}
                onClick={()=>setSelected(b.id)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedBook && (
        <BookDetailSheet
          book={selectedBook}
          isAdmin={member?.is_admin}
          canManage={canManage}
          session={session}
          memberId={member?.id || null}
          myLoanCount={myLoanCount}
          loanCap={loanCap}
          activeLoan={loansMap[selectedBook.id] || null}
          onClose={()=>setSelected(null)}
          onDeleted={()=>{ setSelected(null); loadData() }}
          onLoansChanged={()=>{ loadLoans(); setSelected(null) }}
          addToast={addToast}
        />
      )}

      {showMyLoans && (
        <MyLoansSheet
          myLoans={myLoans}
          books={books}
          onReturn={loadLoans}
          onClose={()=>setShowMyLoans(false)}
          addToast={addToast}
        />
      )}

      {showAddBook && (
        <AddBookSheet
          session={session}
          onAdded={() => { loadData(); setShowAddBook(false) }}
          onClose={() => setShowAddBook(false)}
          addToast={addToast}
        />
      )}
    </div>
  )
}
