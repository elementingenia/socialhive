"use client"
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const router = useRouter()
  const [username, setUsername] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      const email = session.user.email
      // username is the part before @thesocialhive.internal
      setUsername(session.user.user_metadata?.username || email.split('@')[0])
    })
  }, [router])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        maxWidth: 600, margin: '0 auto 2rem',
        paddingBottom: '1rem', borderBottom: '1px solid var(--border)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1.6rem' }}>🐝</span>
          <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)' }}>The Social Hive</span>
        </div>
        <button onClick={handleSignOut} style={{
          background: 'transparent', border: '1px solid var(--border)',
          borderRadius: '8px', padding: '0.4rem 0.9rem',
          color: 'var(--text-dim)', fontSize: '0.85rem', cursor: 'pointer'
        }}>
          Sign out
        </button>
      </header>

      <main style={{ maxWidth: 600, margin: '0 auto' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.4rem' }}>
          G'day{username ? `, ${username}` : ''}! 👋
        </h2>
        <p style={{ color: 'var(--text-dim)', marginBottom: '2rem' }}>
          Welcome to The Social Hive. More coming soon.
        </p>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'
        }}>
          {[
            { label: 'Movie Night', emoji: '🎬', color: 'var(--teal)', soon: true },
            { label: 'Book Club', emoji: '📚', color: 'var(--purple)', soon: true },
            { label: 'Social Events', emoji: '🎉', color: 'var(--terracotta)', soon: true },
            { label: 'Outings', emoji: '🚌', color: 'var(--green)', soon: true },
          ].map(({ label, emoji, color, soon }) => (
            <div key={label} style={{
              background: 'var(--surface)', borderRadius: '14px',
              padding: '1.25rem', boxShadow: 'var(--shadow)',
              borderTop: `4px solid ${color}`, opacity: soon ? 0.7 : 1
            }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>{emoji}</div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{label}</div>
              {soon && <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>Coming soon</div>}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
