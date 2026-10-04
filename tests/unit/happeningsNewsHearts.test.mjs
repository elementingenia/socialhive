// Unit tests for lib/happeningsNewsHearts.js (pure logic, no DB).
//   npm run test:unit
import { canSeeHeartNames, summariseHearts, heartsFor, heartAriaLabel, heartCountText } from '../../lib/happeningsNewsHearts.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

// canSeeHeartNames
ok(canSeeHeartNames({ viewerId: 'a', isAdmin: true, posterId: 'b', canManageEvent: false }) === true, 'admin sees names')
ok(canSeeHeartNames({ viewerId: 'b', isAdmin: false, posterId: 'b', canManageEvent: false }) === true, 'author sees names')
ok(canSeeHeartNames({ viewerId: 'c', isAdmin: false, posterId: 'b', canManageEvent: true }) === true, 'Owner/EC sees names')
ok(canSeeHeartNames({ viewerId: 'c', isAdmin: false, posterId: 'b', canManageEvent: false }) === false, 'ordinary resident does not')
ok(canSeeHeartNames({ viewerId: null, isAdmin: true, posterId: 'b', canManageEvent: true }) === false, 'no viewer -> never')
ok(canSeeHeartNames({ viewerId: 'c', posterId: null }) === false, 'missing poster does not match a viewer')

// summariseHearts
{
  const rows = [
    { post_id: 'p1', member_id: 'm1' }, { post_id: 'p1', member_id: 'm2' },
    { post_id: 'p2', member_id: 'm2' }, { post_id: null, member_id: 'm3' },
  ]
  const s = summariseHearts(rows, 'm1')
  ok(s.p1.count === 2 && s.p1.heartedByMe === true, 'p1 counts 2, hearted by viewer')
  ok(s.p2.count === 1 && s.p2.heartedByMe === false, 'p2 counts 1, not hearted by viewer')
  ok(Object.keys(s).length === 2, 'rows with no post_id ignored')
  const anon = summariseHearts(rows, null)
  ok(anon.p1.heartedByMe === false, 'no viewer -> heartedByMe always false')
  ok(Object.keys(summariseHearts(null, 'm1')).length === 0, 'null rows -> empty')
}

// heartsFor
ok(heartsFor({}, 'x').count === 0 && heartsFor({}, 'x').heartedByMe === false, 'missing post -> zero default')
ok(heartsFor(null, 'x').count === 0, 'null summary -> zero default')

// heartAriaLabel
ok(heartAriaLabel(false, 0) === 'Heart this post', 'aria unhearted no count')
ok(heartAriaLabel(true, 1) === 'Remove your heart (1 heart)', 'aria hearted singular')
ok(heartAriaLabel(false, 5) === 'Heart this post (5 hearts)', 'aria plural')

// heartCountText
ok(heartCountText(0) === '', 'zero shows nothing')
ok(heartCountText(12) === '12', 'count shown')

console.log(`happeningsNewsHearts: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
