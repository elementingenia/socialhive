'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ContactBar } from '@/components/OwnersManager'
import ManageLink from '@/components/ManageLink'
import { useUser } from '@/lib/UserContext'
import { useOwners } from '@/lib/useOwners'

// ── Welcome banner — same dismiss/expand pattern as Show Time/Social Home ──
function WelcomeBanner({ text, colour = 'var(--purple)' }) {
  const STORAGE_KEY = 'library_welcome_dismissed'
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })

  if (!text) return null
  if (dismissed) {
    return (
      <button onClick={() => setDismissed(false)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
          color: colour, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
          padding: '0 0 0.75rem', fontFamily: 'inherit' }}>
        <span style={{ fontSize: '1rem' }}>ℹ</span> Show welcome message
      </button>
    )
  }
  return (
    <div style={{ background: colour, borderRadius: 14, padding: '0.9rem 1rem', marginBottom: '1rem', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ fontSize: '0.9rem', lineHeight: 1.55 }} dangerouslySetInnerHTML={{ __html: text }} />
        <button onClick={() => { setDismissed(true); try { localStorage.setItem(STORAGE_KEY, '1') } catch {} }}
          style={{ flexShrink: 0, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%',
            width: 24, height: 24, color: '#fff', fontSize: '0.85rem', cursor: 'pointer', lineHeight: 1 }}>✕</button>
      </div>
    </div>
  )
}

export default function BookLibraryHomePage() {
  const router = useRouter()
  const [welcomeText, setWelcomeText] = useState('')
  // Owner self-service (Owner_SelfService_and_Library_Hub_Scope_v1, Part A.3):
  // an admin or this hub's Owner gets a link through to "Manage Library".
  const { member, isAdmin } = useUser()
  const { owners: hubOwners } = useOwners('hub', 'library')
  const canManage = isAdmin || (!!member?.id && hubOwners.some(o => o.id === member.id))

  useEffect(() => {
    fetch('/api/hub-settings').then(r => r.json()).then(d => setWelcomeText(d.library?.text || '')).catch(() => {})
  }, [])

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '1rem 1rem 6rem' }}>
      <WelcomeBanner text={welcomeText} colour="var(--purple)" />

      <ContactBar contextType="hub" contextKey="library" contextLabel="Library" colour="var(--purple)"
        style={{ margin: '-2px 0 12px' }} />

      {canManage && <ManageLink href="/booklibrary/manage" label="Manage Library" colour="var(--purple)" />}

      <button onClick={() => router.push('/booklibrary/books')}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '4px solid var(--purple)',
          borderRadius: '16px', padding: '1.25rem', cursor: 'pointer', boxShadow: 'var(--shadow)', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <span style={{ fontSize: '2.2rem' }}>📚</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>Browse the Library</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
              Search, borrow, and return books
            </div>
          </div>
        </div>
        <span style={{ fontSize: '1.4rem', color: 'var(--text-dim)' }}>›</span>
      </button>
    </div>
  )
}
