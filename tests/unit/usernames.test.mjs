// Unit tests for lib/usernames.js -- FirstName+LastInitial with a widening
// tie-break. Worth testing directly because the scheme has almost no headroom:
// 20 first names in the Fullerton Cove roster are already shared by 2-3 people,
// so the collision path is normal operation, not an edge case.
import { nameParts, candidates, suggestUsername } from '../../lib/usernames.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

// ── nameParts: strip anything that isn't a letter ────────────────────────────
eq(nameParts("Doris Sacco"), ["Doris","Sacco"], 'simple two-part name')
eq(nameParts("Susan Ellis-Crewe"), ["Susan","Ellis","Crewe"], 'hyphenated surname splits')
eq(nameParts("Joe O'Hehir"), ["Joe","O","Hehir"], 'apostrophe splits')
eq(nameParts("Caroline 'Next Door' (76)"), ["Caroline","Next","Door"], 'quotes and digits stripped')
eq(nameParts("Hermi"), ["Hermi"], 'single name')
eq(nameParts(""), [], 'empty name yields nothing')
eq(nameParts(null), [], 'null does not throw')

// ── the basic scheme ─────────────────────────────────────────────────────────
eq(suggestUsername("Doris Sacco", []), "DorisS", 'Doris Sacco -> DorisS')
eq(suggestUsername("Patricia Holland", []), "PatriciaH", 'Patricia Holland -> PatriciaH')
eq(suggestUsername("Hermi", []), "Hermi", 'single name falls back to the first name alone')

// ── the tie-break: widen into the surname ────────────────────────────────────
{
  // The real case: three Julies already, then a fourth arrives.
  const taken = ["JulieA","JulieF","JulieJ"]
  eq(suggestUsername("Julie Arnott", taken), "JulieAr", 'existing JulieA taken -> JulieAr')
  eq(suggestUsername("Julie Anderson", taken), "JulieAn", 'a NEW Julie A- gets JulieAn, not a clash')
  eq(suggestUsername("Julie Smith", taken), "JulieS", 'unrelated surname still gets the short form')
}
{
  // Widening more than once.
  const taken = ["PhilS","PhilSa","PhilSan"]
  eq(suggestUsername("Phil Sanders", taken), "PhilSand", 'widens a third time when needed')
}
{
  // Surname fully exhausted -> numbered fallback rather than returning null.
  const taken = ["BobP","BobPi","BobPim","BobPimm"]
  eq(suggestUsername("Bob Pimm", taken), "BobP2", 'exhausted surname falls back to numbering')
}

// ── case-insensitive collision detection ─────────────────────────────────────
eq(suggestUsername("Doris Sacco", ["doriss"]), "DorisSa",
   'collision check is case-insensitive (login lookup uses ilike)')

// ── minimum length is respected ──────────────────────────────────────────────
{
  // "Jo Ng" -> "JoN" is exactly 3, valid. Shorter inputs must still not
  // produce an invalid username.
  const u = suggestUsername("Jo Ng", [])
  ok(u && u.length >= 3, `short name still yields a valid username (got ${u})`)
  const u2 = suggestUsername("Al", [])
  ok(u2 === null || u2.length >= 3, `2-letter single name never returns something too short (got ${u2})`)
}

// ── real roster spot-check: the shared first names all stay distinct ─────────
{
  const roster = [
    "Julie Arnott","Julie Fletcher","Julie Juratowitch",
    "Phil Dorse","Phil Marks","Phil Sanders",
    "Susan Ellis-Crewe","Susan Galley","Susan Handley",
    "Jenny Field","Jenny Kelly","Jenny Schulz",
    "Carol Brown","Carol Percival","Don Cameron","Don Maytom",
    "Bob Beale","Bob Pimm","Sandy Burdon","Sandy Dorse",
  ]
  const taken = []
  for (const n of roster) taken.push(suggestUsername(n, taken))
  ok(new Set(taken.map(t => t.toLowerCase())).size === roster.length,
     `all ${roster.length} shared-first-name residents get unique usernames -> ${taken.join(", ")}`)
  ok(taken.every(t => !!t), 'none returned null')
}

// ── candidates order ─────────────────────────────────────────────────────────
eq(candidates("Doris Sacco").slice(0,3), ["DorisS","DorisSa","DorisSac"], 'candidates widen one letter at a time')

console.log(`usernames: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
