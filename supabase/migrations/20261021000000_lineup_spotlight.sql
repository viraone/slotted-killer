-- Lineup spotlight: which comic the hosts have highlighted on the show-night board
-- (stagetimepnw.tapandlaunch.com/lineup) from the Remote tab. One row. Anyone can read it (the board is public
-- and it holds only a stage name and a position in the lineup); only the hosts (host_chat_members) can move it,
-- and a trigger stamps who moved it and when. In the realtime publication so the board, the remote and each
-- comic's phone follow it without a reload.
begin;

create table public.lineup_spotlight (
  id smallint primary key default 1 check (id = 1),
  -- The show the highlight is for (Seattle date); a highlight from an earlier show is ignored by the pages.
  show_date date,
  -- Position in the lineup (0 = first) and the name shown there when the host picked it. Null = nobody.
  position integer check (position is null or position >= 0),
  name text not null default '',
  set_at timestamptz not null default now(),
  set_by text not null default ''
);
insert into public.lineup_spotlight (id) values (1);

create function public.lineup_spotlight_stamp() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  select m.display_name into new.set_by
    from public.host_chat_members m
    where m.email = lower(coalesce(auth.jwt() ->> 'email', ''));
  if new.set_by is null then
    raise exception 'Only the hosts can move the spotlight';
  end if;
  new.set_at := now();
  return new;
end;
$$;
create trigger lineup_spotlight_stamp before update on public.lineup_spotlight
  for each row execute function public.lineup_spotlight_stamp();

alter table public.lineup_spotlight enable row level security;

create policy "Anyone can see the spotlight" on public.lineup_spotlight
  for select to anon, authenticated using (true);

create policy "Hosts can move the spotlight" on public.lineup_spotlight
  for update to authenticated using (public.is_host_chat_member()) with check (public.is_host_chat_member());

revoke all on public.lineup_spotlight from anon, authenticated;
grant select on public.lineup_spotlight to anon, authenticated;
grant update (show_date, position, name) on public.lineup_spotlight to authenticated;

alter publication supabase_realtime add table public.lineup_spotlight;

commit;
