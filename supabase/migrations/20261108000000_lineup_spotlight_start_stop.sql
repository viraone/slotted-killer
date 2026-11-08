-- Show clock: START / STOP from the hosts' Home (stagetimepnw.tapandlaunch.com), 2026-11-08.
--
-- The spotlight row now means "whose clock this is":
--   position    the comic the clock is for (0 = first in the lineup); null = the show has not started (or was reset)
--   set_at      when the hosts pressed START for that comic (stamped here, so every screen counts from one moment)
--   stopped_at  null while the clock runs; set when the hosts pressed STOP (the comic after `position` is on deck)
--   sets        every finished set this show: [{position, name, started_at, stopped_at}], appended on STOP,
--               so each phone can show how a comic finished (3:00, or +0:40 over) without a second table
-- The TV, the hosts' Home and every comic's lineup page read this one row (realtime UPDATE) and compute the
-- countdown locally from set_at, so they tick the same second.
--
-- Apply to the show database (rickshaw-open-mic) by hand, Viradeth only:
--   supabase db query --linked --project-ref ldodkbdzljfpbnzrpxpu -f supabase/migrations/20261108000000_lineup_spotlight_start_stop.sql
begin;

alter table public.lineup_spotlight
  add column if not exists stopped_at timestamptz,
  add column if not exists sets jsonb not null default '[]'::jsonb;

-- The stamp trigger used to reset set_at on EVERY update. Now:
--   * START (position changes, or a stopped clock is started again): set_at := now(), stopped_at := null
--   * STOP  (stopped_at goes from null to a value): stopped_at := now(), set_at untouched
--   * RESET (position set to null): set_at := now(), stopped_at := null
-- set_by is still stamped with the host's display name on every change, and non-hosts are still refused.
create or replace function public.lineup_spotlight_stamp() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  select m.display_name into new.set_by
    from public.host_chat_members m
    where m.email = lower(coalesce(auth.jwt() ->> 'email', ''));
  if new.set_by is null then
    raise exception 'Only the hosts can move the spotlight';
  end if;
  if new.position is distinct from old.position
     or (old.stopped_at is not null and new.stopped_at is null) then
    new.set_at := now();
    new.stopped_at := null;
  elsif old.stopped_at is null and new.stopped_at is not null then
    new.stopped_at := now();
  end if;
  return new;
end;
$$;

grant update (show_date, position, name, stopped_at, sets) on public.lineup_spotlight to authenticated;

commit;

-- Undo:
--   alter table public.lineup_spotlight drop column stopped_at, drop column sets;
--   and restore the previous lineup_spotlight_stamp() from 20261021000000_lineup_spotlight.sql.
