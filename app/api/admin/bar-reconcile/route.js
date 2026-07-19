import { supabaseAdmin } from "@/lib/supabaseAdmin"
export const dynamic = "force-dynamic"
import { NextResponse } from 'next/server'
import { notify } from '@/lib/notify'


function monthLabel(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

async function getAdmin(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return null
  const { data } = await supabaseAdmin
    .from('members').select('id, is_admin').eq('auth_id', user.id).single()
  return data?.is_admin ? data : null
}

// Group raw tab rows into per-member summaries
function groupByMember(rows) {
  const map = {}
  for (const row of rows) {
    const mid = row.members.id
    if (!map[mid]) {
      map[mid] = {
        member_id: mid,
        name:      row.members.name,
        items:     [],
        total:     0,
      }
    }
    const lineTotal = parseFloat(row.bar_products.price) * row.quantity
    // Merge same product into one line
    const existing = map[mid].items.find(i => i.product_id === row.bar_products.id)
    if (existing) {
      existing.quantity  += row.quantity
      existing.line_total = parseFloat((existing.line_total + lineTotal).toFixed(2))
    } else {
      map[mid].items.push({
        product_id:   row.bar_products.id,
        product_name: row.bar_products.name,
        icon:         row.bar_products.icon,
        unit_price:   parseFloat(row.bar_products.price),
        quantity:     row.quantity,
        line_total:   parseFloat(lineTotal.toFixed(2)),
      })
    }
    map[mid].total = parseFloat((map[mid].total + lineTotal).toFixed(2))
  }
  return Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
}

// GET — preview unreconciled tabs (all members, or ?member_id= for one)
//       ?type=outstanding — returns past reconciled-but-unpaid balances per reconciliation
export async function GET(req) {
  const admin = await getAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const memberId = searchParams.get('member_id')
  const type     = searchParams.get('type')

  // ── Outstanding: past reconciliations not yet paid ──────────────────────────
  if (type === 'outstanding') {
    const { data: reconTabs, error: rtErr } = await supabaseAdmin
      .from('bar_tabs')
      .select('quantity, reconciliation_id, member_id, members!inner(id, name), bar_products!inner(id, name, icon, price), bar_reconciliations!inner(id, period_start, period_end)')
      .not('reconciliation_id', 'is', null)
    if (rtErr) return NextResponse.json({ error: rtErr.message }, { status: 500 })

    const { data: payments } = await supabaseAdmin
      .from('bar_member_payments')
      .select('reconciliation_id, member_id')

    const paidSet = new Set((payments || []).map(p => `${p.reconciliation_id}:${p.member_id}`))
    const unpaid  = (reconTabs || []).filter(r => !paidSet.has(`${r.reconciliation_id}:${r.member_id}`))

    const reconMap = {}
    for (const row of unpaid) {
      const rid = row.reconciliation_id
      if (!reconMap[rid]) {
        reconMap[rid] = {
          reconciliation_id: rid,
          period_start: row.bar_reconciliations.period_start,
          period_end:   row.bar_reconciliations.period_end,
          members: {},
        }
      }
      const mid = row.members.id
      if (!reconMap[rid].members[mid]) {
        reconMap[rid].members[mid] = { member_id: mid, name: row.members.name, total: 0, items: [] }
      }
      const lineTotal = parseFloat(row.bar_products.price) * row.quantity
      const existing  = reconMap[rid].members[mid].items.find(i => i.product_id === row.bar_products.id)
      if (existing) {
        existing.quantity  += row.quantity
        existing.line_total = parseFloat((existing.line_total + lineTotal).toFixed(2))
      } else {
        reconMap[rid].members[mid].items.push({
          product_id:   row.bar_products.id,
          product_name: row.bar_products.name,
          icon:         row.bar_products.icon,
          unit_price:   parseFloat(row.bar_products.price),
          quantity:     row.quantity,
          line_total:   parseFloat(lineTotal.toFixed(2)),
        })
      }
      reconMap[rid].members[mid].total = parseFloat((reconMap[rid].members[mid].total + lineTotal).toFixed(2))
    }

    const result = Object.values(reconMap)
      .sort((a, b) => new Date(a.period_end) - new Date(b.period_end))
      .map(r => ({ ...r, members: Object.values(r.members).sort((a, b) => a.name.localeCompare(b.name)) }))

    return NextResponse.json(result)
  }

  // ── Default: unreconciled preview ────────────────────────────────────────────
  let query = supabaseAdmin
    .from('bar_tabs')
    .select('id, quantity, consumed_at, member_id, members!inner(id, name), bar_products!inner(id, name, icon, price)')
    .is('reconciliation_id', null)
    .order('consumed_at')

  if (memberId) query = query.eq('member_id', memberId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const members = groupByMember(data || [])
  const totalAmount = members.reduce((s, m) => s + m.total, 0)

  return NextResponse.json({
    members,
    total_amount: parseFloat(totalAmount.toFixed(2)),
    item_count:   (data || []).reduce((s, r) => s + r.quantity, 0),
  })
}

// POST — create reconciliation
//   body: { member_id? }  — if member_id present, single-member settle (auto-paid)
export async function POST(req) {
  const admin = await getAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const memberId = body.member_id || null

  // Fetch unreconciled tabs (scoped to member if provided)
  let query = supabaseAdmin
    .from('bar_tabs')
    .select('id, quantity, consumed_at, member_id, members!inner(id, name), bar_products!inner(id, name, icon, price)')
    .is('reconciliation_id', null)
    .order('consumed_at')

  if (memberId) query = query.eq('member_id', memberId)

  const { data: tabs, error: tabErr } = await query
  if (tabErr) return NextResponse.json({ error: tabErr.message }, { status: 500 })
  if (!tabs?.length) return NextResponse.json({ error: 'No outstanding tabs to reconcile' }, { status: 400 })

  // Determine period bounds from the actual tab dates
  const dates = tabs.map(t => new Date(t.consumed_at))
  const periodStart = new Date(Math.min(...dates)).toISOString().slice(0, 10)
  const periodEnd   = new Date().toISOString().slice(0, 10)

  // Create reconciliation record
  const { data: recon, error: reconErr } = await supabaseAdmin
    .from('bar_reconciliations')
    .insert({ period_start: periodStart, period_end: periodEnd, created_by: admin.id })
    .select().single()
  if (reconErr) return NextResponse.json({ error: reconErr.message }, { status: 500 })

  // Link all tabs to this reconciliation
  const { error: linkErr } = await supabaseAdmin
    .from('bar_tabs')
    .update({ reconciliation_id: recon.id })
    .in('id', tabs.map(t => t.id))
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 })

  // Build member breakdown
  const members = groupByMember(tabs)

  // If single-member settle: auto-mark as paid immediately (resident is being
  // settled on the spot — no need to notify them of a balance they just paid)
  if (memberId && members.length === 1) {
    const m = members[0]
    await supabaseAdmin.from('bar_member_payments').insert({
      reconciliation_id: recon.id,
      member_id:         m.member_id,
      total_amount:      m.total,
      recorded_by:       admin.id,
    })
    members[0].paid    = true
    members[0].paid_at = new Date().toISOString()
  } else {
    members.forEach(m => { m.paid = false; m.paid_at = null })
    // Bulk reconciliation — notify every resident left with an outstanding balance
    const month = monthLabel(periodEnd)
    for (const m of members) {
      await notify(m.member_id, null, 'bar_reconciled', `Your Community Bar tab for ${month}: $${m.total.toFixed(2)} — tap to view`)
    }
  }

  return NextResponse.json({
    reconciliation_id: recon.id,
    period_start:      periodStart,
    period_end:        periodEnd,
    members,
    total_amount: parseFloat(members.reduce((s, m) => s + m.total, 0).toFixed(2)),
  })
}

// PATCH — mark a member as paid within an existing reconciliation
//   body: { reconciliation_id, member_id, total_amount }
export async function PATCH(req) {
  const admin = await getAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { reconciliation_id, member_id, total_amount } = await req.json()
  if (!reconciliation_id || !member_id) {
    return NextResponse.json({ error: 'reconciliation_id and member_id required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('bar_member_payments').insert({
    reconciliation_id,
    member_id,
    total_amount: parseFloat(total_amount) || 0,
    recorded_by:  admin.id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, paid_at: new Date().toISOString() })
}
