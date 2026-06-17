"use client"
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Screenings() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('events')
      .select('*, movies(title, poster_url)')
      .gte('event_date', new Date().toISOString().split('T')[0])
      .order('event_date')
      .then(({ data }) => { setEvents(data || []); setLoading(false) })
  }, [])

  return (
    <div style={{ padding: '1.5rem' }}>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.25rem' }}>📅 Upcoming Events</h1>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '3rem', fontSize: '0.9rem' }}>No upcoming events.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {events.map(ev => (
            <div key={ev.id} style={{ background: 'var(--surface)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600 }}>{ev.title}</div>
              <div style={{ color: 'var(--teal)', fontSize: '0.85rem', marginTop: '0.3rem' }}>
                {new Date(ev.event_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })} · {ev.event_time?.slice(0,5)}
              </div>
              {ev.notes && <div style={{ color: 'var(--text-dim)', fontSize: '0.82rem', marginTop: '0.4rem' }}>{ev.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
