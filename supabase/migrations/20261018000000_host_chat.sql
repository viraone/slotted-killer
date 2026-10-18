-- Hosts chat: one group chat for the show's three hosts on stagetimepnw.tapandlaunch.com (the "Hosts" tab).
--
--   * host_chat_members: who is in the chat, by sign-in email, and the name shown over their messages.
--     Members can read the list (to show who is in the chat); nobody can change it with the public key.
--   * host_messages: the messages. Only members can read them or post, as themselves; the author's name is
--     filled in from host_chat_members by a trigger. No editing or deleting from the app.
--   * Storage bucket host-chat (private): photos in messages. Only members can upload or view.
--   * host_messages is in the realtime publication, so new messages appear without a reload (realtime applies
--     the same read rule).
--
-- Accounts are the same email-code accounts as the sign-up; a host who has never signed in gets an account the
-- first time they enter their email and code.

begin;

create table public.host_chat_members (
  email text primary key check (email = lower(email)),
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.host_messages (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '',
  body text check (body is null or char_length(body) between 1 and 4000),
  photo_path text,
  check (body is not null or photo_path is not null)
);
create index host_messages_created_at_idx on public.host_messages (created_at desc);

-- True when the signed-in user's email is on the members list.
create function public.is_host_chat_member() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.host_chat_members m
    where m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_host_chat_member() from public;
grant execute on function public.is_host_chat_member() to anon, authenticated;

-- The author is whoever is signed in, under the name on the members list (not whatever the browser sends).
create function public.host_messages_set_author() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  new.author_id := auth.uid();
  select m.display_name into new.author_name
    from public.host_chat_members m
    where m.email = lower(coalesce(auth.jwt() ->> 'email', ''));
  if new.author_name is null then
    raise exception 'Only the hosts can post in this chat';
  end if;
  new.created_at := now();
  return new;
end;
$$;
create trigger host_messages_set_author before insert on public.host_messages
  for each row execute function public.host_messages_set_author();

alter table public.host_chat_members enable row level security;
alter table public.host_messages enable row level security;

create policy "Hosts can see who is in the chat" on public.host_chat_members
  for select to authenticated using (public.is_host_chat_member());

create policy "Hosts can read messages" on public.host_messages
  for select to authenticated using (public.is_host_chat_member());

create policy "Hosts can post messages" on public.host_messages
  for insert to authenticated with check (public.is_host_chat_member());

revoke all on public.host_chat_members from anon, authenticated;
grant select on public.host_chat_members to authenticated;
revoke all on public.host_messages from anon, authenticated;
grant select, insert (body, photo_path) on public.host_messages to authenticated;

alter publication supabase_realtime add table public.host_messages;

-- Photos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('host-chat', 'host-chat', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

create policy "Hosts can view chat photos" on storage.objects
  for select to authenticated using (bucket_id = 'host-chat' and public.is_host_chat_member());

create policy "Hosts can upload chat photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'host-chat' and public.is_host_chat_member());

insert into public.host_chat_members (email, display_name) values
  ('vxayananh@gmail.com', 'Viradeth'),
  ('nickrcody@gmail.com', 'Nick'),
  ('dinodadcomedy@gmail.com', 'Noah');

commit;

-- Undo:
--   begin;
--   alter publication supabase_realtime drop table public.host_messages;
--   drop policy if exists "Hosts can view chat photos" on storage.objects;
--   drop policy if exists "Hosts can upload chat photos" on storage.objects;
--   delete from storage.objects where bucket_id = 'host-chat';
--   delete from storage.buckets where id = 'host-chat';
--   drop table public.host_messages;
--   drop table public.host_chat_members;
--   drop function public.host_messages_set_author();
--   drop function public.is_host_chat_member();
--   commit;
