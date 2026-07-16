// Unit tests for lib/accounts.js — admin account-management validation.
//   npm run test:unit

import { validateUsername, validatePin, validateNewAccount } from '../../lib/accounts.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

ok(validateUsername('jane') === null, 'valid username => null')
ok(validateUsername('ab') !== null, 'too short username => error')
ok(validateUsername('jane doe') !== null, 'username with space => error')
ok(validateUsername('jane.doe') !== null, 'username with dot => error')
ok(validateUsername('jane_1') === null, 'underscore + digit ok')

ok(validatePin('1234') === null, '4-char pin => null')
ok(validatePin('123') !== null, '3-char pin => error')
ok(validatePin('12 4') !== null, 'pin with space => error')
ok(validatePin(1234) === null, 'numeric pin coerced ok')
ok(validatePin(null) !== null, 'null pin => error')

ok(validateNewAccount({ name: 'Jane', username: 'jane', pin: '1234' }) === null, 'full valid account => null')
ok(validateNewAccount({ name: '', username: 'jane', pin: '1234' }) !== null, 'missing name => error')
ok(validateNewAccount({ name: 'Jane', username: 'ab', pin: '1234' }) !== null, 'bad username => error')
ok(validateNewAccount({ name: 'Jane', username: 'jane', pin: '1' }) !== null, 'bad pin => error')

console.log(`\nlib/accounts.js: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
