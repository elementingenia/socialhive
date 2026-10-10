// Unit tests for lib/adminTabs.js — Admin clean-up tile routing (2026-10-10).
//   npm run test:unit
// Old /admin?tab= links live on in notifications already sent, so every
// retired tile key must still land somewhere sensible.

import { resolveAdminTab, adminHref, ADMIN_SUBTABS, LEGACY_ADMIN_TABS, HUB_SETTINGS_AREAS } from '../../lib/adminTabs.js'
import { HUB_SECTIONS } from '../../lib/hubSections.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

// Grid
eq(resolveAdminTab(null), null, 'no tab = grid')
eq(resolveAdminTab(''), null, 'empty tab = grid')
eq(resolveAdminTab('Nonsense'), null, 'unknown tab = grid')
eq(resolveAdminTab('NewFeatures'), null, 'href-only tile is not an in-page tab')

// Current tiles
eq(resolveAdminTab('HubSettings'), { tab: 'HubSettings', sub: null }, 'Hub Settings has no sub-tabs')
eq(resolveAdminTab('Interests'), { tab: 'Interests', sub: null }, 'Interests unchanged')
eq(resolveAdminTab('Movies'), { tab: 'Movies', sub: 'Suggested' }, 'Show Time default sub')
eq(resolveAdminTab('Movies', 'Enrich'), { tab: 'Movies', sub: 'Enrich' }, 'Show Time Enrich')
eq(resolveAdminTab('Movies', 'Bogus'), { tab: 'Movies', sub: 'Suggested' }, 'bad sub falls back to default')
eq(resolveAdminTab('Clubs'), { tab: 'Clubs', sub: 'Clubs' }, 'Groups & Clubs default sub')
eq(resolveAdminTab('Locations', 'Streets'), { tab: 'Locations', sub: 'Streets' }, 'Locations Streets')
eq(resolveAdminTab('Residents'), { tab: 'Residents', sub: 'Uptake' }, 'Residents default sub')

// Every retired key
eq(resolveAdminTab('PageTexts'), { tab: 'HubSettings', sub: null }, 'PageTexts -> Hub Settings')
eq(resolveAdminTab('Owners'), { tab: 'HubSettings', sub: null }, 'Owners -> Hub Settings')
eq(resolveAdminTab('Tools'), { tab: 'Movies', sub: 'Enrich' }, 'Tools -> Show Time Enrich')
eq(resolveAdminTab('BookClub'), { tab: 'Clubs', sub: 'Clubs' }, 'BookClub -> Groups & Clubs')
eq(resolveAdminTab('Proposals'), { tab: 'Clubs', sub: 'Proposals' }, 'Proposals -> Groups & Clubs Proposals')
eq(resolveAdminTab('Streets'), { tab: 'Locations', sub: 'Streets' }, 'Streets -> Locations Streets')
eq(resolveAdminTab('Uptake'), { tab: 'Residents', sub: 'Uptake' }, 'Uptake -> Residents')
eq(resolveAdminTab('SignInHelp'), { tab: 'Residents', sub: 'SignInHelp' }, 'SignInHelp -> Residents Sign-in Help')
for (const [k, v] of Object.entries(LEGACY_ADMIN_TABS)) {
  ok(ADMIN_SUBTABS[v.tab], `legacy ${k} targets a real tile`)
  if (v.sub) ok(ADMIN_SUBTABS[v.tab].includes(v.sub), `legacy ${k} targets a real sub-tab`)
}

// adminHref round-trips through resolveAdminTab
eq(adminHref('Residents', 'SignInHelp'), '/admin?tab=Residents&sub=SignInHelp', 'href with sub')
eq(adminHref('HubSettings'), '/admin?tab=HubSettings', 'href without sub')
{
  const p = new URLSearchParams(adminHref('Clubs', 'Proposals').split('?')[1])
  eq(resolveAdminTab(p.get('tab'), p.get('sub')), { tab: 'Clubs', sub: 'Proposals' }, 'href round-trip')
}

// Hub Settings covers every Page Texts section exactly once
{
  const covered = HUB_SETTINGS_AREAS.flatMap(a => a.sections)
  const keys = HUB_SECTIONS.map(s => s.key)
  eq([...covered].sort(), [...keys].sort(), 'every Page Texts section appears once in Hub Settings')
  eq(new Set(covered).size, covered.length, 'no section duplicated')
  eq(HUB_SETTINGS_AREAS.find(a => a.key === 'home').ownerKey, null, 'Home has no Owners')
}

console.log(`adminTabs: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
