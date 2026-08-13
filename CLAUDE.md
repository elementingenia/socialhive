# Project Standards — The Social Hive / Element Happenings

Standing rules for any Claude session working in this repo. Read this before making schema changes or handing off work that needs manual steps.

## Database Migrations

**Location:** All schema changes are SQL files in `supabase/migrations/`, sequentially numbered — `NNN_description.sql` (e.g. `081_book_isbn_notes.sql`). This is the single source of truth for the schema. Every migration gets committed here, even ones that haven't been run yet — the repo is the permanent record regardless of when it's actually applied.

**Land the migration file on `main` directly — never only on a feature branch.** This repo's own history (078, 079, 080, 081...) shows the established pattern: the `.sql` file gets its own standalone commit straight to `main`, titled `Add migration NNN_description.sql to main (file only, not yet run)`, independent of whatever branch/PR the accompanying app code lives on. If the app code is on a feature branch, the migration file still gets committed to `main` in its own commit — do not leave it sitting only on the feature branch, even temporarily. Iain looks for migrations on `main`; a migration only visible on an unmerged branch is, from his side, missing. (Got this wrong on 2026-08-13 — committed 081 only on `feature/book-dvd-modal-ui-fixes`, had to land it on `main` separately after Iain couldn't find it.)

**Why manual execution is required:** DDL (`ALTER TABLE`, `CREATE TABLE`, etc.) cannot be run from a Claude sandbox — there's no working direct Postgres connection to Supabase from that environment, and no `exec_sql`-style RPC exists in the DB. Iain has to paste the SQL into the Supabase SQL editor himself, every time.

**Delivery — every migration, no exceptions:**
1. Commit the `.sql` file to `supabase/migrations/` on `main` (per the rule above) — not just wherever the related feature branch happens to be.
2. Paste the full SQL directly in the chat message itself — not "see the file" or a path reference.
3. Also write a standalone copy of the same file into `/Users/iain/Claude/Projects/Element Movie Night/` on Iain's machine (via the device bridge), named to match — e.g. `migration_081_book_isbn_notes.sql`.

Skipping any one of these four (landing on main + the three above) is a failure, not a shortcut — do all of them every time, without being asked.

**Sequencing with code:** Additive changes (new nullable column, new table) are safe to ship in either order — app code should use `select('*')` rather than an explicit column list so it doesn't error before the migration runs. Anything that removes/renames a column, or that new code depends on existing before it can function (e.g. a `NOT NULL` column, a required foreign key), must have the migration run *first*, confirmed by Iain, before that code deploys.

## Why this file exists

This standard was previously tracked only in Claude's private session memory, not in the project itself — which meant it only applied when a session happened to read that memory, and was invisible to anyone else looking at the repo. Iain asked for the SQL delivery rule multiple times across different sessions before this got written down here (2026-08-13). If a rule matters enough to keep repeating, it belongs in this file, not just in memory.
