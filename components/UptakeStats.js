'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { authedFetch } from '@/lib/getAuthToken'

// Admin > Uptake — resident adoption at a glance (2026-09-09). Pulls from
// GET /api/admin/uptake, which aggregates data that already exists
// (members.last_active_at, live since migration 009 -- see that route's own
// comments for the full evidence trail). The one thing genuinely new is the
// "total occupied households" field below: this app has no live source of
// truth for that number (the properties/occupancies foundation tables were
// never cut over), so Iain keys it in from his own reconciliation sheet and
// it's stored in settings.total_occupied_households (migration 102).

function StatCard({ label, value, sub, colour = 'var(--teal)' }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1rem', flex: '1 1 140px', minWidth: 140 }}>
      <div style={{ fontSize: '1.7rem', fontWeight: 800, color: colour, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', marginTop: '0.3rem' }}>{label}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>{sub}</div>}
    </div>
  )
}

export default function UptakeStats() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)
  const [householdInput, setHouseholdInput] = useState('')
  const [savingHouseholds, setSavingHouseholds] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    const res = await authedFetch('/api/admin/uptake')
    if (!res.ok) {
      setError('Could not load uptake stats.')
      return
    }
    const data = await res.json()
    setStats(data)
    setHouseholdInput(data.totalOccupiedHouseholds ?? '')
  }, [])

  useEffect(() => { load() }, [load])

  async function saveHouseholds() {
    const n = householdInput === '' ? null : Number(householdInput)
    if (householdInput !== '' && (!Number.isFinite(n) || n < 0)) return
    setSavingHouseholds(true)
    await supabase.from('settings')
      .update({ value: n == null ? null : String(n), updated_at: new Date().toISOString() })
      .eq('key', 'total_occupied_households')
    setSavingHouseholds(false)
    load()
  }

  if (error) {
    return <div style={{ color: 'var(--danger, #c0392b)', fontSize: '0.85rem' }}>{error}</div>
  }
  if (!stats) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
  }

  const pct = (n) => stats.registeredMembers ? Math.round((n / stats.registeredMembers) * 100) : 0
  const householdPct = (n) => stats.households ? Math.round((n / stats.households) * 100) : 0
  const adoptionPct = stats.totalOccupiedHouseholds
    ? Math.round((stats.households / stats.totalOccupiedHouseholds) * 100)
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
        Registered accounts vs. active use. Activity is tracked on every sign-in and while the app stays open (a 5-minute heartbeat), so &quot;active&quot; below means genuinely opened the app in that window — not just holding a login.
      </div>

      <div>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)', marginBottom: '0.5rem' }}>Registration</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
          <StatCard label="Registered accounts" value={stats.registeredMembers} sub="active, non-test" />
          <StatCard label="Households represented" value={stats.households} colour="var(--purple)"
            sub={adoptionPct != null ? `${adoptionPct}% of ${stats.totalOccupiedHouseholds} occupied households` : 'set total below for a %'} />
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)', marginBottom: '0.5rem' }}>Active use</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
          <StatCard label="Active, last 7 days" value={stats.active7d} colour="var(--terracotta)" sub={`${pct(stats.active7d)}% of registered`} />
          <StatCard label="Active, last 30 days" value={stats.active30d} colour="var(--terracotta)" sub={`${pct(stats.active30d)}% of registered`} />
          <StatCard label="Active, last 90 days" value={stats.active90d} colour="var(--terracotta)" sub={`${pct(stats.active90d)}% of registered`} />
        </div>
      </div>

      {/* Iain, 2026-09-11: "any user in the house that is active means the
          house is active" -- same last_active_at windows as Active use above,
          grouped by house_number instead of counted per member. */}
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)', marginBottom: '0.5rem' }}>Active households</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
          <StatCard label="Active, last 7 days" value={stats.activeHouseholds7d} colour="var(--purple)" sub={`${householdPct(stats.activeHouseholds7d)}% of households represented`} />
          <StatCard label="Active, last 30 days" value={stats.activeHouseholds30d} colour="var(--purple)" sub={`${householdPct(stats.activeHouseholds30d)}% of households represented`} />
          <StatCard label="Active, last 90 days" value={stats.activeHouseholds90d} colour="var(--purple)" sub={`${householdPct(stats.activeHouseholds90d)}% of households represented`} />
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1rem' }}>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)', marginBottom: '0.35rem' }}>Total occupied households</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.6rem' }}>
          The app has no live record of this — it's kept in your own reconciliation sheet. Enter it here to turn &quot;households represented&quot; above into a real adoption %.
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input type="number" min="0" value={householdInput} onChange={e => setHouseholdInput(e.target.value)}
            placeholder="e.g. 81"
            style={{ flex: 1, padding: '0.6rem 0.75rem', borderRadius: 10, border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: '0.9rem' }} />
          <button onClick={saveHouseholds} disabled={savingHouseholds}
            style={{ padding: '0.6rem 1.1rem', borderRadius: 10, border: 'none', background: 'var(--teal)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: savingHouseholds ? 0.6 : 1 }}>
            {savingHouseholds ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        Caveat: accounts created before 2026-06-21 had their activity clock backfilled to that date, so a very old account that never once logged back in can still show as recently &quot;active&quot; against that backfill date rather than genuinely never. Newer accounts aren&apos;t affected.
      </div>
    </div>
  )
}
