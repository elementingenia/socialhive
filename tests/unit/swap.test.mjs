// Unit tests for lib/swap.js (Swap & Sell pure logic, no DB).
//   npm run test:unit
import {
  isSwapLive, canUseSwap, isValidListingCap, isExpired, isListingActive, countActive, capReached,
  expiryReminderDue, isConversationClosed, canStartConversation, canReadConversation, otherPartyId,
  isUnreadFor, priceLabel, statusLabel, contactButtonLabel, validateListing, validateMessage,
  needsPrivacyAck, swapName, filterListings, expiryFrom, daysListedLabel, goneNotification,
  newListingMessage, CATEGORIES, EXPIRY_DAYS, MAX_TITLE, MAX_MESSAGE,
} from '../../lib/swap.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

const DAY = 24 * 60 * 60 * 1000
const now = new Date('2026-10-05T01:00:00Z')
const iso = ms => new Date(now.getTime() + ms).toISOString()

// ── isSwapLive / canUseSwap ─────────────────────────────────────────────────
ok(isSwapLive({ enabled: true, production_enabled: false }, 'preview') === true, 'preview reads enabled')
ok(isSwapLive({ enabled: true, production_enabled: false }, 'production') === false, 'production reads production_enabled')
ok(isSwapLive({ enabled: false, production_enabled: true }, 'production') === true, 'production on')
ok(isSwapLive(null, 'production') === false, 'no row -> off')
ok(canUseSwap({ live: false, isAdmin: true }) === true, 'admin can trial while hidden')
ok(canUseSwap({ live: false, isAdmin: false }) === false, 'resident blocked while hidden')
ok(canUseSwap({ live: true, isAdmin: false }) === true, 'resident ok when live')

// ── cap ─────────────────────────────────────────────────────────────────────
ok(isValidListingCap(2) && isValidListingCap('5') && !isValidListingCap(0) && !isValidListingCap(21) && !isValidListingCap(2.5), 'cap validation')
ok(capReached(2, 2) === true && capReached(1, 2) === false, 'cap reached at the limit')
ok(capReached(2, 'junk') === true && capReached(1, null) === false, 'invalid cap falls back to default 2')

// ── active / expiry ─────────────────────────────────────────────────────────
const live = { status: 'available', expires_at: iso(10 * DAY) }
ok(isListingActive(live, now), 'available + future expiry is active')
ok(isListingActive({ ...live, status: 'reserved' }, now), 'reserved still active')
ok(!isListingActive({ ...live, status: 'gone' }, now), 'gone not active')
ok(!isListingActive({ ...live, hidden_at: iso(-DAY) }, now), 'hidden not active')
ok(!isListingActive({ ...live, expires_at: iso(-1) }, now), 'expired not active')
ok(isExpired({ expires_at: iso(0) }, now), 'expires exactly now counts as expired')
ok(countActive([live, { ...live, status: 'gone' }, { ...live, expires_at: iso(-DAY) }], now) === 1, 'countActive')
ok(Math.round((expiryFrom(now) - now) / DAY) === EXPIRY_DAYS, 'expiryFrom is 30 days out')

ok(expiryReminderDue({ ...live, expires_at: iso(2 * DAY) }, now) === true, 'reminder due inside 3 days')
ok(expiryReminderDue({ ...live, expires_at: iso(3 * DAY) }, now) === true, 'reminder due at exactly 3 days')
ok(expiryReminderDue({ ...live, expires_at: iso(4 * DAY) }, now) === false, 'not due at 4 days')
ok(expiryReminderDue({ ...live, expires_at: iso(2 * DAY), expiry_reminded_at: iso(-DAY) }, now) === false, 'reminder only once')
ok(expiryReminderDue({ ...live, status: 'gone', expires_at: iso(2 * DAY) }, now) === false, 'no reminder for gone')
ok(expiryReminderDue({ ...live, expires_at: iso(-DAY) }, now) === false, 'no reminder once expired')

// ── conversations ───────────────────────────────────────────────────────────
ok(isConversationClosed({ ...live }, now) === false, 'open listing -> open conversation')
ok(isConversationClosed({ status: 'gone', gone_at: iso(-13 * DAY), expires_at: iso(DAY) }, now) === false, 'gone 13 days ago still open')
ok(isConversationClosed({ status: 'gone', gone_at: iso(-14 * DAY), expires_at: iso(DAY) }, now) === true, 'gone 14 days ago closed')
ok(isConversationClosed({ status: 'available', expires_at: iso(-15 * DAY) }, now) === true, 'expired 15 days ago closed')
ok(isConversationClosed({ status: 'available', expires_at: iso(-5 * DAY) }, now) === false, 'expired 5 days ago still open')
ok(isConversationClosed({ status: 'available', expires_at: iso(DAY), hidden_at: iso(-20 * DAY) }, now) === true, 'hidden 20 days ago closed')
ok(isConversationClosed(null, now) === true, 'missing listing -> closed')

const listing = { member_id: 'seller', ...live }
ok(canStartConversation(listing, 'buyer', now), 'buyer can start')
ok(!canStartConversation(listing, 'seller', now), 'seller cannot message own listing')
ok(!canStartConversation({ ...listing, status: 'gone' }, 'buyer', now), 'cannot start on gone')
ok(!canStartConversation(listing, null, now), 'needs a viewer')

const convo = { buyer_id: 'b', seller_id: 's', reported_at: null, last_message_at: iso(-60000) }
ok(canReadConversation(convo, { memberId: 'b' }), 'buyer reads')
ok(canReadConversation(convo, { memberId: 's' }), 'seller reads')
ok(!canReadConversation(convo, { memberId: 'x' }), 'stranger cannot read')
ok(!canReadConversation(convo, { memberId: 'a', isAdmin: true }), 'admin cannot read unreported')
ok(canReadConversation({ ...convo, reported_at: iso(-1) }, { memberId: 'a', isAdmin: true }), 'admin reads once reported')
ok(!canReadConversation({ ...convo, reported_at: iso(-1) }, { memberId: 'x', isAdmin: false }), 'report does not open it to residents')
ok(otherPartyId(convo, 'b') === 's' && otherPartyId(convo, 's') === 'b' && otherPartyId(convo, 'x') === null, 'otherPartyId')

ok(isUnreadFor({ ...convo, buyer_last_read_at: null }, 'b') === true, 'never read -> unread')
ok(isUnreadFor({ ...convo, buyer_last_read_at: iso(0) }, 'b') === false, 'read after last message -> read')
ok(isUnreadFor({ ...convo, seller_last_read_at: iso(-120000) }, 's') === true, 'read before last message -> unread')
ok(isUnreadFor({ ...convo, last_sender_id: 'b', buyer_last_read_at: null }, 'b') === false, 'own last message never unread')
ok(isUnreadFor(convo, 'x') === false, 'stranger never unread')

// ── labels ──────────────────────────────────────────────────────────────────
ok(priceLabel({ type: 'sale', price_dollars: 20 }) === '$20', 'price $20')
ok(priceLabel({ type: 'sale', price_dollars: 1500 }) === '$1,500', 'price with thousands separator')
ok(priceLabel({ type: 'sale', price_dollars: 0 }) === '$0', 'price $0')
ok(priceLabel({ type: 'sale', price_is_offers: true }) === 'Offers', 'offers')
ok(priceLabel({ type: 'free' }) === 'Free' && priceLabel({ type: 'wanted' }) === 'Wanted', 'free / wanted')
ok(statusLabel('sale', 'gone') === 'Gone' && statusLabel('wanted', 'gone') === 'Found', 'gone vs found')
ok(statusLabel('sale', 'reserved') === 'Reserved' && statusLabel('free', 'available') === 'Available', 'other statuses')
ok(contactButtonLabel('wanted') === 'I have one' && contactButtonLabel('sale') === 'Message seller', 'contact button')

// ── validateListing ─────────────────────────────────────────────────────────
const base = { type: 'sale', title: '  Garden chair ', description: '', category: CATEGORIES[0], price_dollars: 15 }
{
  const r = validateListing(base)
  ok(!r.error && r.value.title === 'Garden chair' && r.value.price_dollars === 15 && r.value.description === null, 'valid sale normalised')
}
ok(validateListing({ ...base, type: 'swap' }).error, 'bad type rejected')
ok(validateListing({ ...base, title: '   ' }).error, 'blank title rejected')
ok(validateListing({ ...base, title: 'x'.repeat(MAX_TITLE + 1) }).error, 'long title rejected')
ok(validateListing({ ...base, category: 'Cars' }).error, 'unknown category rejected')
ok(validateListing({ ...base, condition: 'mint' }).error, 'unknown condition rejected')
ok(validateListing({ ...base, price_dollars: 12.5 }).error, 'cents rejected')
ok(validateListing({ ...base, price_dollars: -1 }).error, 'negative rejected')
ok(validateListing({ ...base, price_dollars: '' }).error, 'sale with no price rejected')
{
  const r = validateListing({ ...base, price_dollars: null, price_is_offers: true })
  ok(!r.error && r.value.price_is_offers === true && r.value.price_dollars === null, 'offers accepted, price cleared')
}
{
  const r = validateListing({ ...base, type: 'free', price_dollars: 50 })
  ok(!r.error && r.value.price_dollars === null && r.value.price_is_offers === false, 'free strips any price')
}
{
  const r = validateListing({ ...base, type: 'wanted', price_is_offers: true })
  ok(!r.error && r.value.price_is_offers === false, 'wanted strips offers')
}
{
  const r = validateListing({ title: 'New name' }, { partial: true, existing: { type: 'sale', price_dollars: 10 } })
  ok(!r.error && r.value.title === 'New name' && !('price_dollars' in r.value), 'partial edit leaves price alone')
}
{
  const r = validateListing({ price_dollars: 30 }, { partial: true, existing: { type: 'sale', price_is_offers: false, price_dollars: 10 } })
  ok(!r.error && r.value.price_dollars === 30, 'partial price edit')
}
{
  const r = validateListing({ type: 'sale' }, { partial: true, existing: { type: 'free' } })
  ok(!!r.error, 'switching free -> sale without a price rejected')
}
{
  const r = validateListing({ type: 'free' }, { partial: true, existing: { type: 'sale', price_dollars: 10 } })
  ok(!r.error && r.value.price_dollars === null, 'switching sale -> free clears price')
}

// ── validateMessage ─────────────────────────────────────────────────────────
ok(validateMessage('  hi  ').value === 'hi', 'message trimmed')
ok(validateMessage('   ').error && validateMessage(null).error, 'blank message rejected')
ok(validateMessage('x'.repeat(MAX_MESSAGE + 1)).error, 'long message rejected')

// ── privacy + names ─────────────────────────────────────────────────────────
ok(needsPrivacyAck({ hide_name: true }) === true, 'private, not acked -> needs ack')
ok(needsPrivacyAck({ hide_name: true, swap_privacy_ack_at: iso(0) }) === false, 'acked -> no')
ok(needsPrivacyAck({ hide_name: false }) === false, 'not private -> no')
ok(swapName({ hide_name: true, display_name: 'Jan', name: 'Janet Smith' }) === 'Jan', 'private still shows display name')
ok(swapName({ name: 'Bob Jones' }) === 'Bob Jones' && swapName(null) === 'Resident', 'name fallbacks')

// ── filter ──────────────────────────────────────────────────────────────────
{
  const rows = [
    { type: 'sale', category: 'Furniture', title: 'Oak table', description: 'solid' },
    { type: 'free', category: 'Books & media', title: 'Novels', description: 'box of crime novels' },
    { type: 'wanted', category: 'Tools & DIY', title: 'Ladder', description: '' },
  ]
  ok(filterListings(rows).length === 3, 'no filter returns all')
  ok(filterListings(rows, { type: 'free' }).length === 1, 'type filter')
  ok(filterListings(rows, { category: 'Furniture' }).length === 1, 'category filter')
  ok(filterListings(rows, { query: 'CRIME' }).length === 1, 'search description, case-insensitive')
  ok(filterListings(rows, { query: 'o' }).length === 3, '1-char query ignored')
  ok(filterListings(rows, { type: 'sale', query: 'novel' }).length === 0, 'filters combine')
}

// ── misc ────────────────────────────────────────────────────────────────────
ok(daysListedLabel(iso(-1000), now) === 'Listed today', 'listed today')
ok(daysListedLabel(iso(-DAY - 1000), now) === 'Listed yesterday', 'listed yesterday')
ok(daysListedLabel(iso(-5 * DAY), now) === 'Listed 5 days ago', 'listed N days ago')
ok(goneNotification({ title: 'Lamp', type: 'sale' }).includes('no longer available'), 'gone wording')
ok(goneNotification({ title: 'Ladder', type: 'wanted' }).includes('found'), 'found wording')
ok(newListingMessage({ type: 'sale', title: 'Lamp', price_dollars: 5 }).includes('$5'), 'new listing shows price')
ok(CATEGORIES.slice(0, -1).every((c, i, a) => i === 0 || a[i - 1].localeCompare(c) < 0) && CATEGORIES.at(-1) === 'Other', 'categories A-Z, Other last')

console.log(`swap: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
