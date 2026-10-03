// Unit tests for lib/safeNext.js -- return-to-event after sign-in.
//   npm run test:unit

import { safeNextPath, afterLoginPath, loginHref } from '../../lib/safeNext.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }
const eq = (a, b, m) => ok(a === b, `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

// ── safeNextPath: accepted ──────────────────────────────────────────────────
eq(safeNextPath('/social/events?event=abc'), '/social/events?event=abc', 'hub path with event query')
eq(safeNextPath('/clubs/book-club?event=5'), '/clubs/book-club?event=5', 'club path')
eq(safeNextPath('/home'), '/home', 'home')
eq(safeNextPath('  /screenings  '), '/screenings', 'trims whitespace')

// ── safeNextPath: rejected ──────────────────────────────────────────────────
eq(safeNextPath('https://evil.com'), null, 'absolute URL')
eq(safeNextPath('//evil.com/x'), null, 'protocol-relative URL')
eq(safeNextPath('/\\evil.com'), null, 'backslash prefix')
eq(safeNextPath('/a\\b'), null, 'any backslash')
eq(safeNextPath('javascript:alert(1)'), null, 'javascript: scheme')
eq(safeNextPath('social/events'), null, 'relative path without leading slash')
eq(safeNextPath('/login'), null, 'login itself (loop)')
eq(safeNextPath('/login?next=/home'), null, 'login with query (loop)')
eq(safeNextPath('/x\nSet-Cookie'), null, 'control characters')
eq(safeNextPath(''), null, 'empty')
eq(safeNextPath(null), null, 'null')
eq(safeNextPath(undefined), null, 'undefined')
eq(safeNextPath('/' + 'a'.repeat(600)), null, 'over-long')

// ── afterLoginPath ──────────────────────────────────────────────────────────
eq(afterLoginPath('/screenings?event=1'), '/screenings?event=1', 'safe next is used')
eq(afterLoginPath('https://evil.com'), '/home', 'unsafe next falls back to /home')
eq(afterLoginPath(null), '/home', 'missing next falls back to /home')

// ── loginHref ───────────────────────────────────────────────────────────────
eq(loginHref('/social/events?event=abc'), '/login?next=%2Fsocial%2Fevents%3Fevent%3Dabc', 'next is encoded')
eq(loginHref(null), '/login', 'no next -> plain /login')
eq(loginHref('/home'), '/login', '/home is the default, not worth carrying')
eq(loginHref('//evil.com'), '/login', 'unsafe next dropped')
eq(loginHref('/screenings?event=1', { register: '1' }), '/login?register=1&next=%2Fscreenings%3Fevent%3D1', 'extra params kept')
eq(loginHref(null, { register: '1' }), '/login?register=1', 'extra params without next')

// Round trip: what loginHref writes, the login page reads back unchanged.
const href = loginHref('/clubs/book-club?event=5')
const read = new URLSearchParams(href.split('?')[1]).get('next')
eq(afterLoginPath(read), '/clubs/book-club?event=5', 'round trip through the login URL')

console.log(`safeNext: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
