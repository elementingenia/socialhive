// Unit tests for lib/pinHash.js + lib/pinLockout.js (2026-10-09).
//   npm run test:unit
import { hashPin, verifyPin } from '../../lib/pinHash.js'
import { MAX_PIN_ATTEMPTS, PIN_LOCK_MINUTES, lockMinutesLeft, afterFailedPin, lockedMessage } from '../../lib/pinLockout.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }
const eq = (a, b, m) => ok(a === b, `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

// ── hashing ────────────────────────────────────────────────────────────────
const h = hashPin('1234')
ok(h.startsWith('scrypt$'), 'hash has scrypt prefix')
ok(!h.includes('1234'), 'hash does not contain the PIN')
ok(verifyPin('1234', h), 'correct PIN verifies')
ok(!verifyPin('1235', h), 'wrong PIN rejected')
ok(!verifyPin('', h), 'empty PIN rejected')
ok(!verifyPin(null, h), 'null PIN rejected')
ok(verifyPin(1234, h), 'numeric PIN verifies same as string')
ok(hashPin('1234') !== h, 'salted: same PIN hashes differently each time')
ok(!verifyPin('1234', null), 'no stored hash rejects')
ok(!verifyPin('1234', 'garbage'), 'malformed hash rejects')
ok(!verifyPin('1234', '1234'), 'plain-text stored value is not accepted as a hash')
ok(!verifyPin('1234', 'scrypt$x$y$z$a$b'), 'corrupt params reject without throwing')

// ── lockout ────────────────────────────────────────────────────────────────
const now = new Date('2026-10-09T03:00:00Z')
eq(MAX_PIN_ATTEMPTS, 5, 'max attempts is 5')
eq(PIN_LOCK_MINUTES, 15, 'lock is 15 minutes')
eq(lockMinutesLeft({}, now), 0, 'fresh member not locked')
eq(lockMinutesLeft({ pin_locked_until: '2026-10-09T03:10:00Z' }, now), 10, 'locked, 10 min left')
eq(lockMinutesLeft({ pin_locked_until: '2026-10-09T03:00:30Z' }, now), 1, 'partial minute rounds up')
eq(lockMinutesLeft({ pin_locked_until: '2026-10-09T02:59:00Z' }, now), 0, 'expired lock')

let m = { failed_pin_attempts: 0, pin_locked_until: null }
for (let i = 1; i <= 4; i++) {
  m = afterFailedPin(m, now)
  eq(m.failed_pin_attempts, i, `failure ${i} counted`)
  eq(m.pin_locked_until, null, `failure ${i} does not lock`)
}
m = afterFailedPin(m, now)
eq(m.failed_pin_attempts, 0, '5th failure resets counter')
eq(lockMinutesLeft(m, now), 15, '5th failure locks for 15 minutes')

// after the lock expires, counting starts again from 1
const later = new Date(now.getTime() + 16 * 60000)
const m2 = afterFailedPin({ failed_pin_attempts: 3, pin_locked_until: m.pin_locked_until }, later)
eq(m2.failed_pin_attempts, 1, 'count restarts after lock expiry')
eq(m2.pin_locked_until, null, 'no new lock on first failure after expiry')

ok(/15 more minutes/.test(lockedMessage(15)), 'message plural')
ok(/1 more minute\./.test(lockedMessage(1)), 'message singular')

console.log(`pinSecurity: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
