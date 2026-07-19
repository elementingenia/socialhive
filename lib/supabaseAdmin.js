import { createClient } from "@supabase/supabase-js"

// Single shared service-role client for ALL server-side routes/helpers.
//
// Two things every server caller needs, in one place:
//  - auth: { persistSession:false, autoRefreshToken:false } — correct for
//    stateless server use.
//  - a no-store fetch — WITHOUT this, Next.js's App Router silently caches the
//    fetch() calls supabase-js makes under the hood, so a GET route can serve a
//    STALE snapshot of the DB (the recurring bug: calendar dropped a just-added
//    screening 2026-07-19; cron read back its own just-written row as null
//    2026-07-15). Forcing cache:"no-store" at the point requests leave the
//    client makes every read hit the live DB. It only affects caching — never
//    query logic — so it is always safe.
//
// Do NOT create ad-hoc service-role clients in individual routes; import this
// one so the whole app shares the same (correct) caching behaviour.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }) },
  }
)
