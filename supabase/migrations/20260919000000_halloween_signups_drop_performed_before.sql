-- The "Have you performed at Rickshaw in the past?" question was removed
-- from the Halloween Costume Contest form; the form no longer sends
-- performed_before, so drop the column (added not null in
-- 20260918000000_halloween_costume_contest_signups.sql, before sign-ups
-- ever opened, so there's no data to preserve).

alter table public.halloween_signups
  drop column if exists performed_before;
