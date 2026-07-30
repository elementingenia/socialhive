# Foundation Rebuild — Slice E Change Inventory

Generated 2026-07-30 against main `43d5e0d` by pattern-matching the working tree,
then cross-checked against the **live** PostgREST schema (not the migration files —
see the warning below).

---

## Headline

| | |
|---|---|
| Person-referencing DB columns | **39** across 27 tables |
| Code references to change | **637** |
| Distinct files touched | **81** |

The approved scope says *"12 source files branch on `member_id`/`contact_id`/
`owner_contact_id`"*. That figure counted files containing **branching logic** —
the `if (member_id) … else if (contact_id) …` forks. It is correct as far as it
goes, and it is **not** the size of Slice E. The full surface is 81 files.

Nothing in that changes the decision to do the rebuild — the branching forks are
the part that is genuinely hard, and they really are ~12 files. The other ~69 are
mechanical renames. But the estimate should be set from 81 files, not 12.

---

## By pattern

| Pattern | Refs | Files | Nature of change |
|---|---:|---:|---|
| `member_id` | 351 | 56 | → `person_id`. Mechanical, but 351 of them. |
| `contact_id` | 86 | 13 | **Deleted, not renamed.** These are the branching forks. |
| `from('members')` | 77 | 52 | → `from('people')` |
| `house_number` | 29 | 6 | → derived via `lib/occupancy.js`, no column |
| `contact_categories` | 26 | 6 | → `categories` / `category_people` |
| `owner_id` / `owner_contact_id` | 20 | 7 | → single `owner_person_id` |
| `asker_member_id` | 16 | 3 | → `asker_person_id` |
| `auth_email` / `authEmail` | 13 | 4 | mostly survives — `lib/authEmail.js` already owns this |
| `from('contacts')` | 11 | 6 | → `from('people')` |
| `settings` table | 8 | 5 | now per-community; `invite_token` moves to `communities` |

## By area

| Area | Refs |
|---|---:|
| `app/api` (routes) | 266 |
| `app` (pages) | 114 |
| `components` | 107 |
| `lib` | 106 |
| `tests` | 44 |

## Heaviest files — do these first

| Refs | File | Why it's the worst |
|---:|---|---|
| 69 | `components/EventSlideOut.js` | every booking/attendee path in one component |
| 51 | `app/api/coordinator/route.js` | walk-ups, party naming, payments, cancellation |
| 34 | `app/api/info/contacts/route.js` | the `MEMBER_OWNED` redirect logic **disappears entirely** |
| 30 | `app/(app)/info/contacts/page.js` | member-vs-contact display forks |
| 29 | `lib/questionRouting.js` | five routing targets, all keyed on member ids |
| 23 | `app/(app)/social/events/page.js` | |
| 22 | `app/api/admin/bar-reconcile/route.js` | Bar is parked — can be deferred |
| 21 | `app/api/admin/accounts/route.js` | account creation + `set_username` |
| 20 | `lib/attendees.js` | + 29 refs in its test file |

**Two whole classes of code get deleted rather than migrated**, which is the
actual payoff:

1. `app/api/info/contacts/route.js`'s `MEMBER_OWNED` list and the
   write-redirect it guards. With one table there is no second row to write to
   the wrong copy of, so the trap it exists to prevent cannot occur.
2. Every `member_id ?? contact_id` fork — 86 references. A person is a person.

---

## A warning worth recording

I extracted the person-referencing columns from the migration files twice with
different regexes and got **37** and **38**. The live PostgREST schema says
**39**. Both sweeps were wrong: the first missed lowercase `uuid` column
declarations, the second missed `ALTER TABLE … ADD COLUMN` forms with unusual
spacing.

Two of the three columns the regexes missed (`events.coordinator_id`,
`events.payments_reconciled_by`) are load-bearing. Had the cutover been written
from either sweep it would have left dangling references to a dropped table.

**For Slice E: enumerate from the live schema, never from the migration files.**

---

## Suggested sequencing

Slice E is the only slice that cannot be pre-built and held, because it has to
compile against the new schema. Everything else is now written and verified.

1. **Migrations first** (068 → wipe → 069 → 070), in one sitting. The app is
   broken between 069 and 070 by design.
2. `lib/` (106 refs) — the shared logic everything else imports.
3. `app/api` (266 refs) — routes, heaviest first.
4. `components` + `app` pages (221 refs).
5. `tests` (44 refs) — including the `testbot` fixture, which becomes a
   `people` row. Migration 033's protection trigger references `members` and
   **must be rewritten or CI will fail silently**, exactly as it did for the
   whole of its visible history in July.
6. Defer `bar-reconcile` (22 refs) — the module is parked behind
   `BAR_ENABLED = false`.
