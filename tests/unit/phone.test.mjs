// Unit tests for lib/phone.js -- input mask + tap-to-call/message links
// (2026-10-03). Pure logic.
//
//   npm run test:unit

import { formatPhoneInput, phoneDigits, telHref, smsHref, isMobileNumber } from '../../lib/phone.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

ok(formatPhoneInput('0434357060') === '0434 357 060', 'input mask 4-3-3 (existing behaviour)')
ok(phoneDigits('0434 357 060') === '0434357060', 'spaces stripped')
ok(phoneDigits('+61 434 357 060') === '+61434357060', 'leading + kept')
ok(phoneDigits('(02) 4982 1234') === '0249821234', 'brackets stripped')
ok(phoneDigits('') === '' && phoneDigits(null) === '', 'empty/null -> empty')
ok(telHref('0434 357 060') === 'tel:0434357060', 'tel link digits only')
ok(telHref('') === null && telHref(null) === null, 'no number -> no tel link')
ok(isMobileNumber('0434 357 060'), 'AU mobile recognised')
ok(isMobileNumber('+61 434 357 060'), '+61 mobile recognised')
ok(!isMobileNumber('02 4982 1234'), 'landline is not a mobile')
ok(!isMobileNumber('0434 357'), 'short number is not a mobile')
ok(smsHref('0434 357 060') === 'sms:0434357060', 'sms link for a mobile')
ok(smsHref('+61 434 357 060') === 'sms:+61434357060', 'sms link keeps +')
ok(smsHref('02 4982 1234') === null, 'no sms link for a landline')

console.log(`\nlib/phone.js: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
