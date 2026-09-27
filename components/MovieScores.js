'use client'
// The score column shown on every Suggestions movie card: community
// average (with vote count) or "Not yet rated", the viewer's own vote,
// then IMDb and Rotten Tomatoes. Reused by the "Rate a Film" cards so the
// same movie never shows different scores in different places.
export default function MovieScores({ movie, avgData, myVote, minWidth = 68 }) {
  if (!movie) return null
  return (
    <div style={{ padding:'0.55rem 0.75rem', display:'flex', flexDirection:'column', alignItems:'flex-end', justifyContent:'center', gap:'0.2rem', flexShrink:0, minWidth }}>
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
        {movie.rating_rt && <a href={`https://www.rottentomatoes.com/search?search=${encodeURIComponent(movie.title || '')}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{ fontSize:'0.65rem', color:'#fa320a', fontWeight:600, textDecoration:'none' }}>🍅 {movie.rating_rt}</a>}
      </div>
    </div>
  )
}
