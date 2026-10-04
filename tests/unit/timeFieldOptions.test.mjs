// Unit tests for lib/timeFieldOptions.js -- End Time must allow the start
// hour when a later half-hour exists in it (Iain, 2026-10-05: 09:00 start
// could not end at 09:30).
import { availableHours, usableMinutes, isTimeAllowed } from '../../lib/timeFieldOptions.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

// Start 09:00 -> end hour 09 offered, with only :30
ok(availableHours({ minTime: '09:00' })[0] === '09', 'start 09:00 keeps hour 09')
eq(usableMinutes('09', { minTime: '09:00' }), ['30'], 'start 09:00 -> 09 offers :30 only')
eq(usableMinutes('10', { minTime: '09:00' }), ['00', '30'], 'later hours unaffected')
ok(isTimeAllowed('09:30', { minTime: '09:00' }), '09:00 -> 09:30 allowed')
ok(!isTimeAllowed('09:00', { minTime: '09:00' }), 'end equal to start not allowed')
ok(!isTimeAllowed('08:30', { minTime: '09:00' }), 'end before start not allowed')

// Start 09:30 -> hour 09 has nothing left, first offered is 10
eq(availableHours({ minTime: '09:30' })[0], '10', 'start 09:30 -> first end hour 10')
ok(isTimeAllowed('10:00', { minTime: '09:30' }), '09:30 -> 10:00 allowed')

// No start -> all hours
eq(availableHours({}).length, 24, 'no minTime -> 24 hours')

// Space-booking bounds still respected
eq(availableHours({ hourFloor: 8, hourCeil: 22 })[0], '08', 'floor 8')
eq(availableHours({ hourFloor: 8, hourCeil: 22 }).slice(-1)[0], '22', 'ceiling 22')
eq(usableMinutes('22', { hourCeil: 22 }), ['00'], 'ceiling hour :00 only')
eq(availableHours({ minTime: '22:00', hourFloor: 8, hourCeil: 22 }), [], 'start at ceiling -> no end options')
eq(availableHours({ minTime: '21:30', hourFloor: 8, hourCeil: 22 }), ['22'], 'start 21:30 -> end 22:00 only')

// Late night
eq(availableHours({ minTime: '23:00' }), ['23'], 'start 23:00 -> 23:30 only')
eq(availableHours({ minTime: '23:30' }), [], 'start 23:30 -> nothing')

console.log(`timeFieldOptions: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
