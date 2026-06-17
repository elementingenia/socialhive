"use client"
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Movies() {
  const [movies, setMovies] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('movies').select('*').order('title').then(({ data }) => {
      setMovies(data || [])
      setLoading(false)
    })
  }, [])

  return (
    <div style={{ padding: '1.5rem' }}>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.25rem' }}>🎬 Movie Library</h1>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>
      ) : movies.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '3rem', fontSize: '0.9rem' }}>No movies yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {movies.map(m => (
            <div key={m.id} style={{ background: 'var(--surface)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
              {m.poster_url && <img src={m.poster_url} alt={m.title} style={{ width: 46, height: 68, objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />}
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{m.title}</div>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.2rem' }}>{m.year}{m.genre ? ` · ${m.genre}` : ''}</div>
                {m.rating_imdb && <div style={{ color: 'var(--teal-light)', fontSize: '0.78rem', marginTop: '0.1rem' }}>⭐ {m.rating_imdb}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
