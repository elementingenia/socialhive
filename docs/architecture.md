# Architecture Notes

## Core data model

Events-first schema — movies are one type of event:

- `members` — residents (auth via Supabase Auth)
- `events` — screenings, social events, etc (type field: `movie` | `general`)
- `bookings` — member ↔ event (with waitlist support)
- `movies` — movie library (TMDB metadata, we_own flag, streaming info)
- `votes` — member votes on suggested movies

## Key decisions

- Supabase Auth replaces PIN-based login
- Row Level Security (RLS) on all tables
- Serverless API routes (Next.js) replace Google Apps Script
- No more Google Sheets dependency

## Migration from Element Movies

Existing data to migrate from Google Sheets:
- Members sheet → `members` table
- Movies sheet → `movies` table  
- Screenings sheet → `events` table (type: movie)
- Bookings sheet → `bookings` table
- Votes sheet → `votes` table
- Waitlist sheet → `bookings` table (status: waitlist)
