// Shared Page Texts section config — the single source of truth for which
// hub_settings rows exist, their label/colour/hint, and whether they carry
// sub-notices or a loan cap. Extracted 2026-08-12 (Owner self-service scope,
// Part A.3) so both Admin > Page Texts (all sections) and each area's own
// "Manage this area" screen (its one section only) render from the same
// definitions instead of two copies drifting apart.
export const HUB_SECTIONS = [
  {
    key: 'home', label: 'Hive Home', colour: 'var(--amber)', hex: '#f59e0b',
    hasSubs: true, subsLabel: 'Sub Notices',
    hint: 'Main announcement and sub-notices shown on the home screen.',
  },
  {
    key: 'movies', label: 'Show Time Home', colour: 'var(--teal)', hex: '#0d9488',
    hasSubs: false, hint: 'Welcome message on the Show Time landing page.',
  },
  {
    key: 'movies_suggestions', label: 'Show Time — Suggestions', colour: 'var(--teal)', hex: '#0d9488',
    hasSubs: false, hint: 'Text shown at the top of the Suggestions page.',
  },
  {
    key: 'movies_dvd', label: 'Show Time — DVD Library', colour: 'var(--teal)', hex: '#0d9488',
    hasSubs: false, hasLoanCap: true, hint: 'Text shown at the top of the DVD Library. Loan cap sets how many DVDs a resident can have out at once.',
  },
  {
    key: 'social', label: 'Social Events', colour: 'var(--terracotta)', hex: '#c2410c',
    hasSubs: false, hint: 'Welcome message on the Social Events page.',
  },
  {
    key: 'library', label: 'Library Home', colour: 'var(--purple)', hex: '#7c3aed',
    hasSubs: false, hint: 'Welcome message on the Library landing page.',
  },
  {
    key: 'library_books', label: 'Library — Books', colour: 'var(--purple)', hex: '#7c3aed',
    hasSubs: false, hasLoanCap: true, hint: 'Text shown at the top of the book grid. Loan cap sets how many books a resident can have out at once.',
  },
]
