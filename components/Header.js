'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const PAGE_TITLES = {
  '/home': 'Home',
  '/movies': 'Movies',
  '/screenings': 'Screenings',
}

const MODULE_COLOURS = {
  '/home': 'var(--amber)',
  '/movies': 'var(--teal)',
  '/screenings': 'var(--teal)',
}

export default function Header() {
  const [memberName, setMemberName] = useState('')
  const pathname = usePathname()
  const router  = useRouter()

  const pageTitle    = PAGE_TITLES[pathname] || ''
  const moduleColour = MODULE_COLOURS[pathname] || 'var(--amber)'

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
      background: 'var(--surface)',
      borderBottom: '3px solid ' + moduleColour,
      padding: '0.5rem 1rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      boxShadow: '0 1px 8px rgba(0,0,0,0.07)',
    }}>

      {/* Left: bee logo mark + brand name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
        <img
          src="/logo_hex_bee.png"
          alt="The Social Hive"
          style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 4 }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em',
            color: moduleColour, textTransform: 'uppercase', lineHeight: 1,
            whiteSpace: 'nowrap',
          }}>The Social Hive</div>
          <div style={{
            fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: 1.2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {memberName ? 'Welcome, ' + memberName : '…'}
          </div>
        </div>
      </div>

      {/* Centre: page title */}
      <div style={{
        fontSize: '0.95rem', fontWeight: 700,
        color: moduleColour,
        letterSpacing: '0.01em',
        flexShrink: 0,
      }}>{pageTitle}</div>

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
