// Unit tests for lib/addResident.js — Add Resident (2026-11-16).
//   npm run test:unit
import { validateAddResident, residentCategoryIds, possibleDuplicates } from '../../lib/addResident.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

ok(validateAddResident({ name: 'Jane Smith', username: 'JaneS' }) === null, 'name + username => ok')
ok(validateAddResident({ name: ' ', username: 'JaneS' }) !== null, 'blank name => error')
ok(validateAddResident({ name: 'Jane', username: 'ab' }) !== null, 'short username => error')
ok(validateAddResident({ name: 'Jane', display_name: 'Jo', username: 'JaneS' }) !== null, '2-letter display name => error')
ok(validateAddResident({ name: 'Jane', display_name: '', username: 'JaneS' }) === null, 'blank display name => uses full name')
ok(validateAddResident({ name: 'Jane', username: 'JaneS', house_number: '14a' }) !== null, 'non-number house => error')
ok(validateAddResident({ name: 'Jane', username: 'JaneS', house_number: '14' }) === null, 'house number ok')

const R = 'res', A = 'a', B = 'b'
ok(JSON.stringify(residentCategoryIds([], R, [R, A, B])) === '["res"]', 'Residents only by default')
ok(JSON.stringify(residentCategoryIds([B, R, A, B], R, [R, A, B])) === '["res","b","a"]', 'Residents first, no repeats')
ok(JSON.stringify(residentCategoryIds(['zzz', A], R, [R, A])) === '["res","a"]', 'unknown category dropped')
ok(JSON.stringify(residentCategoryIds(null, R, [R])) === '["res"]', 'null chosen ok')

const members = [{ id: 'm1', name: 'Jane Smith', house_number: '14' }, { id: 'm2', name: 'Bob Jones', house_number: '22' }]
const contacts = [
  { id: 'c1', name: 'jane  smith', house_number: '14', member_id: null, categoryIds: [R] },
  { id: 'c2', name: 'Jane Smith', house_number: null, member_id: 'm1', categoryIds: [R] },
  { id: 'c3', name: 'Jane Smith', member_id: null, categoryIds: ['plumbers'] },
  { id: 'c4', name: 'Pat Lee', house_number: '22', member_id: null, categoryIds: [R] },
]
const d = possibleDuplicates({ name: 'Jane Smith', house_number: '22' }, members, contacts, R)
ok(d.some(x => x.kind === 'login' && x.id === 'm1' && x.reason === 'name'), 'login with same name found')
ok(d.some(x => x.kind === 'contact' && x.id === 'c1' && x.canUse), 'no-login resident with same name offered to use')
ok(!d.some(x => x.id === 'c2'), 'contact already linked to a login skipped')
ok(!d.some(x => x.id === 'c3'), 'non-resident contact skipped')
ok(d.some(x => x.id === 'm2' && x.reason === 'house'), 'login at same house found')
ok(d.some(x => x.id === 'c4' && x.reason === 'house' && !x.canUse), 'no-login resident at same house, not offered')
ok(d[0].reason === 'name' && d[d.length - 1].reason === 'house', 'name matches listed first')
ok(possibleDuplicates({ name: '', house_number: null }, members, contacts, R).length === 0, 'nothing typed => no matches')

console.log(`addResident: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
