-- 107_event_series_location_endtime.sql
--
-- Confirmed via Iain's own screenshot + direct code read (2026-09-15): every
-- Group/Club recurring-series occurrence (Book Club "Monthly Gathering" and
-- every other schedule-defined club) is generated with Venue and End Time
-- permanently blank, forcing a re-entry on every single edit -- not a UI
-- pre-fill bug, a genuine data gap. event_series (055_event_series.sql) was
-- given location_type/location (free text, for offsite) but never
-- location_id (the on-site venue FK) or event_end_time -- both of which
-- events itself has had since 058_retrospective_schema_catchup.sql. So the
-- series TEMPLATE has never been able to record a venue selection or an end
-- time, and lib/generateSeriesEvents.js's occurrencePayload() had nothing to
-- copy from even if it tried.
--
-- This migration only adds the columns; the three code paths that read/
-- write them (POST /api/series create, generateSeriesEvents' occurrence
-- stamping, and the PROPAGATE list that "this and future dates" edits use)
-- are fixed in the same PR, not left to a follow-up.

alter table event_series
  add column if not exists location_id     UUID references locations(id) on delete set null,
  add column if not exists event_end_time  TIME WITHOUT TIME ZONE;

comment on column event_series.location_id is
  'On-site venue FK, mirrors events.location_id. Added 2026-09-15 -- series occurrences were being generated with this permanently null, forcing venue re-entry on every edit.';
comment on column event_series.event_end_time is
  'Mirrors events.event_end_time. Added 2026-09-15 -- series occurrences were being generated with this permanently null, forcing re-entry on every edit for any venue that requires an end time.';
