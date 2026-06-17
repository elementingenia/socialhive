"use client"
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const navItems = [
  { path: '/home',       label: 'Home',   icon: '🏠' },
  { path: '/movies',     label: 'Movies', icon: '🎬' },
  { path: '/screenings', label: 'Events', icon: '📅' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const btn = (active) => ({
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
    background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.5rem',
    color: active ? 'var(--teal)' : 'var(--text-dim)',
    fontWeight: active ? 600 : 400, fontSize: '0.7rem', fontFamily: 'inherit',
  })

  return (
    <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)', display: 'flex', zIndex: 100 }}>
      {navItems.map(({ path, label, icon }) => (
        <button key={path} onClick={() => router.push(path)} style={btn(pathname === path)}>
          <span style={{ fontSize: '1.25rem' }}>{icon}</span>
          {label}
        </button>
      ))}
      <button onClick={signOut} style={btn(false)}>
        <span style={{ fontSize: '1.25rem' }}>👤</span>
        Sign out
      </button>
    </nav>
  )
}
