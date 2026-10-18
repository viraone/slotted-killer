-- Two follow-ups to 20261018010000, found on the first run:
--   * Read marks never saved: the app upserts them, and an upsert's "on conflict do update" sets every column it
--     was given, which needs UPDATE on those columns. UPDATE was granted on read_at only, so the write was refused.
--     Grant UPDATE on the table; the policy still limits a reader to their own rows.
--   * The hosts' inbox shows who replied last ("Nick: On our way"), not just that it was a host.

begin;

grant update on public.comedian_thread_reads to authenticated;

drop function public.comedian_threads();
create function public.comedian_threads()
  returns table (comedian_id uuid, comedian_name text, last_at timestamptz, last_body text, last_from_host boolean, last_author text, last_has_photo boolean, unread integer)
  language sql stable security definer set search_path = ''
as $$
  select
    m.comedian_id,
    (select coalesce(nullif(u.raw_user_meta_data ->> 'stage_name', ''), u.email, 'Comedian') from auth.users u where u.id = m.comedian_id),
    max(m.created_at),
    (array_agg(m.body order by m.created_at desc))[1],
    (array_agg(m.from_host order by m.created_at desc))[1],
    (array_agg(m.author_name order by m.created_at desc))[1],
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

commit;
