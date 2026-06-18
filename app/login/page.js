"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Login() {
  const [step, setStep] = useState(1)
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  function handleNameSubmit(e) {
    e.preventDefault()
    if (!username.trim()) return
    setError('')
    setStep(2)
  }

  async function handlePinDigit(digit) {
    if (loading || pin.length >= 4) return
    const newPin = pin + digit
    setPin(newPin)
    if (newPin.length === 4) {
      await submitLogin(username.trim(), newPin)
    }
  }

  function handleBackspace() {
    setPin(p => p.slice(0, -1))
    setError('')
  }

  async function submitLogin(uname, pinCode) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: uname, pin: pinCode })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Incorrect PIN')
        setPin('')
        setLoading(false)
        return
      }
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: pinCode
      })
      if (authError) {
        setError('Sign-in failed. Please try again.')
        setPin('')
        setLoading(false)
      } else {
        router.replace('/home')
      }
    } catch {
      setError('Network error. Please try again.')
      setPin('')
      setLoading(false)
    }
  }

  const containerStyle = {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', padding: '1.5rem'
  }
  const headerStyle = { textAlign: 'center', marginBottom: '2rem' }
  const inputStyle = {
    width: '100%', padding: '0.85rem 1rem', boxSizing: 'border-box',
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '10px', color: 'var(--text)', fontSize: '1.05rem', outline: 'none',
  }
  const btnStyle = {
    padding: '0.9rem', background: 'var(--teal)', color: '#0f1117',
    border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: 600,
    cursor: 'pointer', width: '100%'
  }
  const pinBtnStyle = {
    padding: '1.1rem', background: 'var(--surface2)', color: 'var(--text)',
    border: '1px solid var(--border)', borderRadius: '12px',
    fontSize: '1.4rem', fontWeight: 500, cursor: 'pointer',
  }
  const errorStyle = { color: 'var(--danger)', fontSize: '0.85rem', textAlign: 'center', margin: '0 0 1rem' }

  // Step 1 — name
  if (step === 1) {
    return (
      <div style={containerStyle}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={headerStyle}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🐝</div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 600 }}>The Social Hive</h1>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginTop: '0.3rem' }}>Fullerton Cove community</p>
          </div>
          <form onSubmit={handleNameSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: '0.6rem', fontWeight: 500 }}>
                What&apos;s your name?
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter your name"
                autoFocus
                autoComplete="off"
                required
                style={inputStyle}
              />
            </div>
            {error && <p style={errorStyle}>{error}</p>}
            <button type="submit" style={{ ...btnStyle, opacity: username.trim() ? 1 : 0.5 }} disabled={!username.trim()}>
              Continue
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Step 2 — PIN pad
  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div style={containerStyle}>
      <div style={{ width: '100%', maxWidth: 320, textAlign: 'center' }}>
        <button onClick={() => { setStep(1); setPin(''); setError('') }}
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '1.5rem', display: 'block' }}>
          ← Back
        </button>
        <div style={headerStyle}>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.95rem', marginBottom: '0.4rem' }}>
            Hi <strong style={{ color: 'var(--text)' }}>{username}</strong>
          </p>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 600 }}>Enter your PIN</h2>
        </div>

        {/* dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1.75rem' }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width: 16, height: 16, borderRadius: '50%',
              background: i < pin.length ? 'var(--teal)' : 'transparent',
              border: `2px solid ${i < pin.length ? 'var(--teal)' : 'var(--border)'}`,
              transition: 'all 0.15s'
            }} />
          ))}
        </div>

        {error && <p style={errorStyle}>{error}</p>}

        {/* keypad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.65rem', maxWidth: 280, margin: '0 auto' }}>
          {digits.map((d, i) => (
            d === '' ? <div key={i} /> :
            d === '⌫' ? (
              <button key={i} onClick={handleBackspace} disabled={loading}
                style={{ ...pinBtnStyle, background: 'transparent', color: 'var(--text-dim)', fontSize: '1.5rem', border: 'none' }}>
                ⌫
              </button>
            ) : (
              <button key={i} onClick={() => handlePinDigit(d)}
                disabled={loading || pin.length >= 4}
                style={{ ...pinBtnStyle, opacity: loading ? 0.5 : 1 }}>
                {d}
              </button>
            )
          ))}
        </div>

        {loading && <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: '1.5rem' }}>Signing in…</p>}
      </div>
    </div>
  )
}
