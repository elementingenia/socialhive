'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const PAGE_TITLES = {
  '/home': 'Home',
  '/movies': 'Movies',
  '/screenings': 'Screenings',
}

export default function Header() {
  const [memberName, setMemberName] = useState('')
  const pathname = usePathname()
  const router  = useRouter()

  const pageTitle = PAGE_TITLES[pathname] || ''

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        supabase.from('members').select('name').eq('auth_id', session.user.id).single()
          .then(({ data }) => { if (data) setMemberName(data.name) })
      }
    })
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      padding: '0.6rem 1rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      boxShadow: '0 1px 8px rgba(0,0,0,0.07)',
    }}>
      {/* Left: welcome */}
      <div>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', lineHeight: 1 }}>Welcome</div>
        <div style={{ fontSize: '0.92rem', fontWeight: 700, lineHeight: 1.2 }}>{memberName || '…'}</div>
      </div>

      {/* Centre: page title */}
      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.02em' }}>{pageTitle}</div>

      {/* Right: help + sign out */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        <a
          href="https://iainpallot.github.io/elementmovies/user-guide.html"
          target="_blank" rel="noopener noreferrer"
          aria-label="Help"
          style={{
            width: 30, height: 30, borderRadius: '50%',
            border: '2px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-dim)', fontWeight: 800, fontSize: '0.82rem',
            textDecoration: 'none', lineHeight: 1, flexShrink: 0,
          }}
        >?</a>
        <button
          onClick={signOut}
          style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: '8px',
            padding: '0.3rem 0.65rem', fontSize: '0.76rem', color: 'var(--text-dim)',
            cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >Sign out</button>
      </div>
    </header>
  )
}
