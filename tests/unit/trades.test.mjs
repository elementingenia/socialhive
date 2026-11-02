// Unit tests for lib/trades.js -- Recommend a Trade (2026-11-03). Pure logic.
//
//   npm run test:unit

import {
  canUseTrades, normaliseMode, isTradesCategory, normalisePhone, isValidTradePhone, formatTradePhone,
  validateTrade, findDuplicateTrade, sortTrades, visibleRecommendations, recommendedByLine,
  tradePermissions, unlistedTradeTypes, tradeAddedMessage, TRADE_NOTE_MAX,
} from '../../lib/trades.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

// Switch
ok(normaliseMode('nonsense') === 'off', 'unknown mode -> off')
ok(!canUseTrades('off', { isAdmin: true }), 'off: not even admins')
ok(canUseTrades('admins', { isAdmin: true }) && !canUseTrades('admins', { isAdmin: false }), 'admins mode: admins only')
ok(canUseTrades('everyone', { isAdmin: false }), 'everyone mode: residents')
ok(isTradesCategory(' trades ') && !isTradesCategory('Committee'), 'Trades category match')

// Phone
ok(normalisePhone('+61 411 647 305') === '0411647305', '+61 -> 0')
ok(isValidTradePhone('0411 647 305'), 'mobile valid')
ok(isValidTradePhone('(02) 4982 1234'), 'landline valid')
ok(isValidTradePhone('1300 123 456'), '1300 valid')
ok(!isValidTradePhone('0411 647'), 'short invalid')
ok(!isValidTradePhone(''), 'empty invalid')
ok(formatTradePhone('0411647305') === '0411 647 305', '4-3-3 format')

// Validation
const good = validateTrade({ trade_type: ' Plumber ', name: 'Jake  Pace', phone: '0450455312', note: 'Great job' })
ok(good.ok && good.value.name === 'Jake Pace' && good.value.trade_type === 'Plumber', 'valid trade cleaned')
ok(good.value.phone === '0450 455 312', 'phone stored 4-3-3')
const bizOnly = validateTrade({ trade_type: 'Painter', business_name: 'GK Painting', phone: '0413592308' })
ok(bizOnly.ok && bizOnly.value.name === 'GK Painting', 'business only -> used as name')
const bad = validateTrade({ trade_type: '', name: '', phone: '123', email: 'nope' })
ok(!bad.ok && bad.errors.trade_type && bad.errors.name && bad.errors.phone && bad.errors.email, 'all errors reported')
ok(validateTrade({ trade_type: 'X', name: 'Y', phone: '0411111111', note: 'z'.repeat(400) }).value.note.length === TRADE_NOTE_MAX, 'note capped')

// Duplicates
const trades = [
  { id: 'a', name: 'Jake Pace', trade_type: 'Plumber', phone: '0450 455 312' },
  { id: 'b', name: 'Grant', business_name: 'GK Painting', trade_type: 'Painter', phone: '0413 592 308' },
]
ok(findDuplicateTrade(trades, { phone: '+61450455312' })?.id === 'a', 'same phone found')
ok(findDuplicateTrade(trades, { name: 'jake pace', trade_type: 'plumber', phone: '0400000000' })?.id === 'a', 'same name+type found')
ok(!findDuplicateTrade(trades, { name: 'Jake Pace', trade_type: 'Electrician', phone: '0400000000' }), 'same name other trade not dup')
ok(findDuplicateTrade(trades, { business_name: 'gk painting', trade_type: 'Painter', phone: '0400000000' })?.id === 'b', 'business name match')
ok(!findDuplicateTrade(trades, { phone: '0450455312', excludeId: 'a' }), 'excludes itself when editing')

// Sorting
const counts = { a: 1, b: 3, c: 3, d: 0 }
const sorted = sortTrades([
  { id: 'a', name: 'Zed', trade_type: 'Electrician' },
  { id: 'b', name: 'Bob', trade_type: 'Electrician' },
  { id: 'c', name: 'Al', trade_type: 'Electrician' },
  { id: 'd', name: 'Pat', trade_type: null },
  { id: 'e', name: 'Ann', trade_type: 'Cleaner' },
], t => counts[t.id] || 0).map(t => t.id)
ok(sorted.join() === 'e,c,b,a,d', 'type A-Z, most recommended, ties A-Z, untyped last')

// Visible recommendations (Private left out)
const members = { m1: { id: 'm1' }, m2: { id: 'm2', hide_name: true }, m3: { id: 'm3' } }
const recs = [
  { member_id: 'm3', is_original: false, created_at: '2026-01-02' },
  { member_id: 'm2', is_original: false, created_at: '2026-01-01' },
  { member_id: 'm1', is_original: true, created_at: '2026-01-03' },
]
const vis = visibleRecommendations(recs, members).map(r => r.member_id)
ok(vis.join() === 'm1,m3', 'original first, Private left out')
ok(visibleRecommendations([{ member_id: 'gone' }], members).length === 0, 'unknown member left out')

ok(recommendedByLine(['Jane']) === 'Recommended by Jane', 'one name')
ok(recommendedByLine(['Jane', 'Bob', 'Al', 'Sue']) === 'Recommended by Jane, Bob +2', 'with +N')
ok(recommendedByLine([]) === '', 'no names -> empty')

// Permissions
const p1 = tradePermissions({ recs: [{ member_id: 'm1', is_original: true }], meId: 'm1', addedBy: 'm1' })
ok(p1.canEdit && !p1.canWithdraw && !p1.canRecommend, 'original: edit, locked, already recommending')
const p2 = tradePermissions({ recs: [{ member_id: 'm1', is_original: true }, { member_id: 'm2' }], meId: 'm2', addedBy: 'm1' })
ok(!p2.canEdit && p2.canWithdraw, 'other recommender: withdraw only')
const p3 = tradePermissions({ recs: [], meId: 'm9', isAdmin: true, addedBy: null })
ok(p3.canEdit && p3.canRecommend, 'admin edits admin-added trade')

// Unlisted types
const un = unlistedTradeTypes([{ trade_type: 'Pool' }, { trade_type: 'pool' }, { trade_type: 'Plumber' }], [{ name: 'Plumber' }])
ok(un.length === 1 && un[0].count === 2, 'free-text types grouped and counted')

ok(tradeAddedMessage({ trade_type: 'Plumber', name: 'Jake', by: 'Jane' }).startsWith('Jane recommended a new plumber: Jake'), 'admin message')

console.log(`\nlib/trades.js: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
