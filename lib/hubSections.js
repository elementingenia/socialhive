// Shared Page Texts section config — the single source of truth for which
// hub_settings rows exist, their label/colour/hint, and whether they carry
// sub-notices or a loan cap. Extracted 2026-08-12 (Owner self-service scope,
// Part A.3) so both Admin > Page Texts (all sections) and each area's own
// "Manage this area" screen (its one section only) render from the same
// definitions instead of two copies drifting apart.
// hasEnableToggle: true sections get a "Show this text to residents" switch
// (2026-09-22, welcome-text on/off scope) driven by hub_settings.enabled --
// the same column Voting/Committee already use, but for THOSE two `enabled`
// already means "show/hide the entire hub on Home" (their own "Manage this
// area" screens carry that switch -- see app/(app)/voting/manage/page.js's
// VotingEnabledToggle and the matching Committee tile gate in
// app/(app)/home/page.js). Reusing it here too would let this editor's
// switch silently pull the whole hub off Home, not just its welcome text --
// confirmed with Iain 2026-09-22, so voting/committee deliberately do NOT
// get hasEnableToggle and keep only their existing whole-hub switch.
export const HUB_SECTIONS = [
  {
    key: 'home', label: 'Happenings Home', colour: 'var(--amber)', hex: '#f59e0b',
    hasSubs: true, subsLabel: 'Sub Notices', hasEnableToggle: true,
    hint: 'Main announcement and sub-notices shown on the home screen.',
  },
  {
    key: 'movies', label: 'Show Time Home', colour: 'var(--teal)', hex: '#0d9488',
    hasSubs: false, hasEnableToggle: true, hint: 'Welcome message on the Show Time landing page.',
  },
  {
    key: 'movies_suggestions', label: 'Show Time — Suggestions', colour: 'var(--teal)', hex: '#0d9488',
    hasSubs: false, hasEnableToggle: true, hint: 'Text shown at the top of the Suggestions page.',
  },
  {
    key: 'movies_dvd', label: 'Show Time — DVD Library', colour: 'var(--teal)', hex: '#0d9488',
    hasSubs: false, hasLoanCap: true, hasEnableToggle: true, hint: 'Text shown at the top of the DVD Library. Loan cap sets how many DVDs a resident can have out at once.',
  },
  {
    key: 'social', label: 'Social Hive', colour: 'var(--terracotta)', hex: '#c2410c',
    hasSubs: false, hasEnableToggle: true, hint: 'Welcome message on the Social Hive page.',
  },
  {
    key: 'library', label: 'Library Home', colour: 'var(--purple)', hex: '#7c3aed',
    hasSubs: false, hasEnableToggle: true, hint: 'Welcome message on the Library landing page.',
  },
  {
    key: 'library_books', label: 'Library — Books', colour: 'var(--purple)', hex: '#7c3aed',
    hasSubs: false, hasLoanCap: true, hasEnableToggle: true, hint: 'Text shown at the top of the book grid. Loan cap sets how many books a resident can have out at once.',
  },
  {
    key: 'voting', label: 'Voting', colour: 'var(--voting)', hex: '#1d4ed8',
    hasSubs: false, hint: 'Welcome message on the Voting hub page. Hub visibility is controlled from Manage Voting, not here.',
  },
  {
    key: 'committee', label: 'Committee', colour: 'var(--committee)', hex: '#475569',
    hasSubs: false, hint: 'Welcome message on the Committee Notice Board page. No show/hide switch here — the same hub_settings.enabled flag already governs whether the Committee tile shows on Home.',
  },
]
