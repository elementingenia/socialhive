"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Login() {
  const [tab, setTab] = useState('signin')
  const router = useRouter()

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', padding: '1.5rem',
      background: 'var(--bg)'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <img
          src="/wordmark_final.png"
          alt="The Social Hive"
          style={{ width: '280px', maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
        />
      </div>

      <div style={{
        width: '100%', maxWidth: 400,
        background: 'var(--surface)', borderRadius: '16px',
        padding: '1.5rem', boxShadow: 'var(--shadow)'
      }}>
        <div style={{
          display: 'flex', gap: '0.25rem', background: 'var(--surface2)',
          borderRadius: '10px', padding: '4px', marginBottom: '1.5rem'
        }}>
          {[['signin','Sign In'],['register','Register'],['change','Change Password']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              flex: 1, padding: '0.55rem 0.25rem', border: 'none', borderRadius: '8px', cursor: 'pointer',
              fontSize: '0.78rem', fontWeight: 600, transition: 'all 0.2s',
              background: tab === key ? 'var(--amber)' : 'transparent',
              color: tab === key ? '#ffffff' : 'var(--text-dim)'
            }}>{label}</button>
          ))}
        </div>

        {tab === 'signin' && <SignIn router={router} />}
        {tab === 'register' && <Register onSuccess={() => setTab('signin')} />}
        {tab === 'change' && <ChangePassword />}
      </div>
    </div>
  )
}

function SignIn({ router }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showDevicePrompt, setShowDevicePrompt] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Invalid username or password'); setLoading(false); return }
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.authPassword
      })
      if (authError) { setError('Sign-in failed. Please try again.'); setLoading(false) }
      else {
        setLoading(false)
        setShowDevicePrompt(true)
      }
    } catch { setError('Network error. Please try again.'); setLoading(false) }
  }

  async function signOutOthers() {
    setSigningOut(true)
    await supabase.auth.signOut({ scope: 'others' })
    router.replace('/home')
  }

  function continueWithAll() {
    router.replace('/home')
  }

  if (showDevicePrompt) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📱</div>
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.4rem' }}>Signed in!</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Would you like to sign out of any other devices where you&apos;re currently signed in?
          </div>
        </div>
        <button
          onClick={signOutOthers}
          disabled={signingOut}
          style={{ padding: '0.85rem', background: 'var(--amber)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '0.92rem', fontWeight: 700, cursor: signingOut ? 'not-allowed' : 'pointer', opacity: signingOut ? 0.7 : 1 }}>
          {signingOut ? 'Signing out…' : 'Yes, sign out other devices'}
        </button>
        <button
          onClick={continueWithAll}
          disabled={signingOut}
          style={{ padding: '0.85rem', background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.92rem', fontWeight: 600, cursor: 'pointer' }}>
          No, keep all sessions
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Field label="USERNAME" value={username} onChange={setUsername} placeholder="Your username" />
      <Field label="PASSWORD" value={password} onChange={setPassword} placeholder="Your password" type="password" />
      {error && <p style={errStyle}>{error}</p>}
      <Btn loading={loading} label="Sign In" />
    </form>
  )
}

function Register({ onSuccess }) {
  const [inviteCode, setInviteCode] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: inviteCode.trim(), username: username.trim(), password, confirmPassword: confirm })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Registration failed'); setLoading(false); return }
      onSuccess()
    } catch { setError('Network error. Please try again.'); setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Field label="INVITE CODE" value={inviteCode} onChange={setInviteCode} placeholder="Enter invite code" />
      <Field label="USERNAME" value={username} onChange={setUsername} placeholder="Choose a username" />
      <Field label="PASSWORD" value={password} onChange={setPassword} placeholder="Choose a password (min 4 chars)" type="password" />
      <Field label="CONFIRM PASSWORD" value={confirm} onChange={setConfirm} placeholder="Confirm password" type="password" />
      {error && <p style={errStyle}>{error}</p>}
      <Btn loading={loading} label="Register" />
    </form>
  )
}

function ChangePassword() {
  const [username, setUsername] = useState('')
  const [current, setCurrent] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (newPass !== confirm) { setError('New passwords do not match'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), currentPassword: current, newPassword: newPass })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to change password'); setLoading(false); return }
      setSuccess(true)
    } catch { setError('Network error. Please try again.'); setLoading(false) }
  }

  if (success) return (
    <p style={{ textAlign: 'center', color: 'var(--teal)', padding: '1rem 0' }}>
      ✓ Password changed successfully. You can now sign in.
    </p>
  )

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Field label="USERNAME" value={username} onChange={setUsername} placeholder="Your username" />
      <Field label="CURRENT PASSWORD" value={current} onChange={setCurrent} placeholder="Current password" type="password" />
      <Field label="NEW PASSWORD" value={newPass} onChange={setNewPass} placeholder="New password (min 4 chars)" type="password" />
      <Field label="CONFIRM NEW PASSWORD" value={confirm} onChange={setConfirm} placeholder="Confirm new password" type="password" />
      {error && <p style={errStyle}>{error}</p>}
      <Btn loading={loading} label="Change Password" />
    </form>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: '0.7rem', fontWeight: 700,
        letterSpacing: '1px', color: 'var(--text-dim)', marginBottom: '0.4rem'
      }}>
        {label}
      </label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} required autoComplete="off"
        style={{
          width: '100%', padding: '0.85rem 1rem', boxSizing: 'border-box',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: '10px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none'
        }}
      />
    </div>
  )
}

function Btn({ loading, label }) {
  return (
    <button type="submit" disabled={loading} style={{
      padding: '0.9rem', background: 'var(--amber)', color: '#ffffff',
      border: 'none', borderRadius: '10px', fontSize: '0.95rem', fontWeight: 700,
      cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
      marginTop: '0.25rem', width: '100%'
    }}>
      {loading ? 'Please wait…' : label}
    </button>
  )
}

const errStyle = { color: 'var(--danger)', fontSize: '0.85rem', textAlign: 'center', margin: 0 }
