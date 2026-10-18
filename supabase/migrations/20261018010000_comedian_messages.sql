-- "Message the Hosts": a private line from each comedian to the show's hosts (the three in host_chat_members).
--
--   * comedian_messages: one thread per comedian (comedian_id). A comedian reads and posts only in their own thread;
--     a host reads and posts in every thread. A trigger decides who the author is (from the sign-in, never the
--     browser): a host's message is from_host with their listed name, a comedian's carries their stage name (or
--     email) and always lands in their own thread.
--   * comedian_thread_reads: per reader, how far they have read a thread (for the hosts' unread marks).
--   * comedian_threads(): the hosts' inbox, one row per comedian, newest first, with that host's unread count.
--   * host_names(): the hosts' first names, so a comedian's screen can say who reads their messages.
--   * Storage bucket comedian-chat (private): photos, in a folder per comedian; hosts and that comedian only.
--   * Realtime on comedian_messages (its read rule applies).
--   * Hosts are emailed about new comedian messages: the notify-hosts function runs every minute (same secret and
--     pattern as the signup sync) and sets hosts_notified_at on what it has sent.

begin;

create table public.comedian_messages (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  comedian_id uuid not null references auth.users (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_host boolean not null default false,
  author_name text not null default '',
  body text check (body is null or char_length(body) between 1 and 4000),
  photo_path text,
  hosts_notified_at timestamptz,
  check (body is not null or photo_path is not null)
);
create index comedian_messages_thread_idx on public.comedian_messages (comedian_id, created_at desc);
create index comedian_messages_pending_idx on public.comedian_messages (created_at) where not from_host and hosts_notified_at is null;

create table public.comedian_thread_reads (
  reader_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  comedian_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null,
  primary key (reader_id, comedian_id)
);

create function public.comedian_messages_set_author() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  host_name text;
begin
  new.author_id := auth.uid();
  new.created_at := now();
  select m.display_name into host_name
    from public.host_chat_members m
    where m.email = lower(coalesce(auth.jwt() ->> 'email', ''));
  if host_name is not null then
    -- A host replying in a comedian's thread. Nothing to notify the hosts about.
    new.from_host := true;
    new.author_name := host_name;
    new.hosts_notified_at := now();
  else
    -- A comedian: always their own thread, under their stage name.
    new.comedian_id := auth.uid();
    new.from_host := false;
    new.hosts_notified_at := null;
    select coalesce(nullif(u.raw_user_meta_data ->> 'stage_name', ''), u.email, 'Comedian')
      into new.author_name
      from auth.users u where u.id = auth.uid();
  end if;
  return new;
end;
$$;
create trigger comedian_messages_set_author before insert on public.comedian_messages
  for each row execute function public.comedian_messages_set_author();

-- The hosts' inbox: one row per comedian who has written, newest first, with the asking host's unread count.
create function public.comedian_threads()
  returns table (comedian_id uuid, comedian_name text, last_at timestamptz, last_body text, last_from_host boolean, last_has_photo boolean, unread integer)
  language sql stable security definer set search_path = ''
as $$
  select
    m.comedian_id,
    (select coalesce(nullif(u.raw_user_meta_data ->> 'stage_name', ''), u.email, 'Comedian') from auth.users u where u.id = m.comedian_id),
    max(m.created_at),
    (array_agg(m.body order by m.created_at desc))[1],
    (array_agg(m.from_host order by m.created_at desc))[1],
    (array_agg(m.photo_path is not null order by m.created_at desc))[1],
    count(*) filter (
      where not m.from_host
        and m.created_at > coalesce(
          (select r.read_at from public.comedian_thread_reads r where r.reader_id = auth.uid() and r.comedian_id = m.comedian_id),
          'epoch'::timestamptz)
    )::integer
  from public.comedian_messages m
  where public.is_host_chat_member()
  group by m.comedian_id
  order by max(m.created_at) desc;
$$;
revoke all on function public.comedian_threads() from public;
grant execute on function public.comedian_threads() to authenticated;

create function public.host_names() returns text[]
  language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(m.display_name order by m.created_at), '{}') from public.host_chat_members m;
$$;
revoke all on function public.host_names() from public;
grant execute on function public.host_names() to authenticated;

alter table public.comedian_messages enable row level security;
alter table public.comedian_thread_reads enable row level security;

create policy "Hosts read every thread, a comedian their own" on public.comedian_messages
  for select to authenticated using (public.is_host_chat_member() or comedian_id = auth.uid());

create policy "Hosts post in any thread, a comedian in their own" on public.comedian_messages
  for insert to authenticated with check (public.is_host_chat_member() or comedian_id = auth.uid());

create policy "Readers see their own read marks" on public.comedian_thread_reads
  for select to authenticated using (reader_id = auth.uid());
create policy "Readers set their own read marks" on public.comedian_thread_reads
  for insert to authenticated with check (reader_id = auth.uid() and (public.is_host_chat_member() or comedian_id = auth.uid()));
create policy "Readers move their own read marks" on public.comedian_thread_reads
  for update to authenticated using (reader_id = auth.uid()) with check (reader_id = auth.uid());

revoke all on public.comedian_messages from anon, authenticated;
grant select, insert (comedian_id, body, photo_path) on public.comedian_messages to authenticated;
revoke all on public.comedian_thread_reads from anon, authenticated;
grant select, insert (reader_id, comedian_id, read_at), update (read_at) on public.comedian_thread_reads to authenticated;

alter publication supabase_realtime add table public.comedian_messages;

-- Photos: a folder per comedian, open to the hosts and that comedian.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comedian-chat', 'comedian-chat', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

create policy "Comedian chat photos: hosts and the comedian can view" on storage.objects
  for select to authenticated
  using (bucket_id = 'comedian-chat' and (public.is_host_chat_member() or (storage.foldername(name))[1] = auth.uid()::text));

create policy "Comedian chat photos: hosts and the comedian can upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'comedian-chat' and (public.is_host_chat_member() or (storage.foldername(name))[1] = auth.uid()::text));

-- Email the hosts about new comedian messages, once a minute.
select cron.schedule(
  'notify-hosts-of-comedian-messages',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://ldodkbdzljfpbnzrpxpu.supabase.co/functions/v1/notify-hosts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sync_function_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $cron$
);

commit;

-- Undo:
--   begin;
--   select cron.unschedule('notify-hosts-of-comedian-messages');
--   alter publication supabase_realtime drop table public.comedian_messages;
--   drop policy if exists "Comedian chat photos: hosts and the comedian can view" on storage.objects;
--   drop policy if exists "Comedian chat photos: hosts and the comedian can upload" on storage.objects;
--   -- empty the comedian-chat bucket through the Storage API, then: delete from storage.buckets where id = 'comedian-chat';
--   drop function public.comedian_threads(); drop function public.host_names();
--   drop table public.comedian_thread_reads; drop table public.comedian_messages;
--   drop function public.comedian_messages_set_author();
--   commit;
