-- 089_voting_coordinator.sql
-- Adds an optional single Coordinator to a voting event, mirroring the
-- coordinator_id pattern already used on Show Time/Social/Clubs' base event
-- forms (screenings/social/clubs events all carry a single coordinator_id
-- FK to members, resolved via CoordPicker in each hub's own form) -- Iain,
-- 2026-09-02 review: "There is no event coordinator option which should be
-- in scope." A Voting event's coordinator gets the same manage rights as
-- the Voting hub's Owner/admin, but scoped to that one event only (see
-- lib/areaAuth.js's new requireVotingEventManage).

alter table voting_events
  add column if not exists coordinator_id uuid references members(id) on delete set null;

-- Verification: column exists, nullable, FK to members.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'voting_events' and column_name = 'coordinator_id'
  ) then
    raise exception '089_voting_coordinator: voting_events.coordinator_id was not created';
  end if;
end $$;
