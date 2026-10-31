// Unit tests for lib/eventLocation.js -- "In the village" location type
// (Iain, 2026-10-31).  npm run test:unit
import {
  LOCATION_TYPES, normaliseLocationType, cleanVillageLocation, allowsTransport,
  villageLocation, stripTransport, locationDisplay, VILLAGE_LOCATION_MAX,
} from '../../lib/eventLocation.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

eq(LOCATION_TYPES, ['onsite', 'village', 'offsite'], 'three types, in button order')
eq(normaliseLocationType('village'), 'village', 'village kept')
eq(normaliseLocationType('offsite'), 'offsite', 'offsite kept')
eq(normaliseLocationType(undefined), 'onsite', 'missing -> onsite')
eq(normaliseLocationType('garden'), 'onsite', 'unknown -> onsite')

eq(cleanVillageLocation('  Outside  42\nBanksia St  '), 'Outside 42 Banksia St', 'one line, trimmed')
eq(cleanVillageLocation(null), '', 'null -> empty')
eq(cleanVillageLocation('x'.repeat(300)).length, VILLAGE_LOCATION_MAX, 'capped')

eq(allowsTransport('offsite'), true, 'offsite allows bus/cars')
eq(allowsTransport('village'), false, 'village no bus/cars')
eq(allowsTransport('onsite'), false, 'onsite no bus/cars')

eq(villageLocation({ location_type: 'onsite', location: 'x' }), null, 'not village -> null')
eq(villageLocation({ location_type: 'offsite', location: 'x' }), null, 'offsite -> null')
ok(!!villageLocation({ location_type: 'village', location: '   ' }).error, 'blank village -> error')
eq(villageLocation({ location_type: 'village', location: ' The lake lawn ', location_id: 'abc' }),
  { location_id: null, location: 'The lake lawn' }, 'village clears room id')

const p = stripTransport({ location_type: 'village', has_bus: true, bus_driver_id: 'm1', bus_driver_name: 'X',
  bus_driver_free: true, bus_max_seats: 10, allow_personal_vehicles: true })
eq([p.has_bus, p.bus_driver_id, p.bus_driver_name, p.bus_driver_free, p.bus_max_seats, p.allow_personal_vehicles],
  [false, null, null, false, null, false], 'village strips transport')
const q = stripTransport({ location_type: 'offsite', has_bus: true, allow_personal_vehicles: true })
eq([q.has_bus, q.allow_personal_vehicles], [true, true], 'offsite keeps transport')

eq(locationDisplay({ location_type: 'offsite', location: 'Stockton Club\n1 Main Rd' }), 'Stockton Club', 'offsite first line')
eq(locationDisplay({ location_type: 'village', location: 'Outside 42 Banksia St' }), 'Outside 42 Banksia St', 'village as-is')
eq(locationDisplay({ location_type: 'onsite', location: '' }), null, 'empty -> null')

console.log(`eventLocation: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
