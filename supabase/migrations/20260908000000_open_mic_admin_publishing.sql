-- Admin review and publishing for open mic submissions.
--
-- Approving a submission copies its `record` (an open-mics.json-shaped object)
-- into public.published_open_mics. The website reads that table alongside the
-- static data/open-mics.json file and merges the two, so an approved mic shows
-- up within seconds without a redeploy.
--
-- Admins are the emails in public.app_admins (see 20260901000000). Everything
-- that writes goes through a security-definer RPC that re-checks is_app_admin(),
-- so the browser needs no write grants at all.

create table if not exists public.published_open_mics (
  -- Same slug used as `id` inside data/open-mics.json, so a record can be moved
  -- between the file and this table without changing identity.
  id text primary key,
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  submission_id bigint references public.open_mic_submissions(id) on delete set null,
  is_active boolean not null default true,
  published_by text,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.published_open_mics is
  'Open mics approved in the admin panel. Merged with data/open-mics.json by the site at load time.';

create index if not exists published_open_mics_active_idx
  on public.published_open_mics (is_active, published_at desc);

alter table public.published_open_mics enable row level security;

revoke all on table public.published_open_mics from anon, authenticated;
grant select on table public.published_open_mics to anon, authenticated;
grant all on table public.published_open_mics to service_role;

-- Live listings are public data; the site fetches them with the publishable key.
drop policy if exists "published mics are publicly readable" on public.published_open_mics;
create policy "published mics are publicly readable"
  on public.published_open_mics
  for select
  to anon, authenticated
  using (is_active = true);

-- Admins additionally see unpublished ones in the panel.
drop policy if exists "admins read every published mic" on public.published_open_mics;
create policy "admins read every published mic"
  on public.published_open_mics
  for select
  to authenticated
  using (public.is_app_admin());

-- Admins need to read the submission queue. Writes stay RPC-only.
grant select on table public.open_mic_submissions to authenticated;

drop policy if exists "admins read submissions" on public.open_mic_submissions;
create policy "admins read submissions"
  on public.open_mic_submissions
  for select
  to authenticated
  using (public.is_app_admin());

-- Turns "Broadview Tap House" + an address into the slug style used by the
-- existing records in data/open-mics.json.
create or replace function public.build_open_mic_slug(p_record jsonb)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(
      regexp_replace(
        lower(
          coalesce(nullif(trim(p_record->>'venue'), ''), coalesce(p_record->>'name', ''))
          || ' ' || coalesce(p_record->>'location', '')
        ),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-'
    ),
    ''
  );
$$;

create or replace function public.approve_open_mic_submission(
  p_submission_id bigint,
  p_record jsonb default null
)
returns public.published_open_mics
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_submission public.open_mic_submissions;
  v_record jsonb;
  v_id text;
  v_row public.published_open_mics;
begin
  if not public.is_app_admin() then
    raise exception 'Not authorized';
  end if;

  select * into v_submission
  from public.open_mic_submissions
  where id = p_submission_id;

  if v_submission.id is null then
    raise exception 'Submission % was not found', p_submission_id;
  end if;

  -- The panel may pass an edited record; fall back to what was submitted.
  v_record := coalesce(p_record, v_submission.record);
  if jsonb_typeof(v_record) is distinct from 'object' then
    raise exception 'The listing must be a JSON object';
  end if;
  if coalesce(trim(v_record->>'name'), '') = '' then
    raise exception 'The listing needs a name';
  end if;
  if coalesce(trim(v_record->>'location'), '') = '' then
    raise exception 'The listing needs an address';
  end if;

  v_id := coalesce(
    nullif(btrim(regexp_replace(lower(coalesce(v_record->>'id', '')), '[^a-z0-9]+', '-', 'g'), '-'), ''),
    public.build_open_mic_slug(v_record)
  );
  if v_id is null then
    raise exception 'Could not work out an id for this listing';
  end if;
  v_record := jsonb_set(v_record, '{id}', to_jsonb(v_id));

  insert into public.published_open_mics as existing (
    id, record, submission_id, is_active, published_by
  )
  values (
    v_id, v_record, p_submission_id, true, lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  on conflict (id) do update
    set record = excluded.record,
        submission_id = coalesce(excluded.submission_id, existing.submission_id),
        is_active = true,
        published_by = excluded.published_by,
        updated_at = now()
  returning * into v_row;

  update public.open_mic_submissions
  set status = 'added',
      reviewed_at = now()
  where id = p_submission_id;

  return v_row;
end;
$$;

create or replace function public.review_open_mic_submission(
  p_submission_id bigint,
  p_status text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Not authorized';
  end if;
  if p_status not in ('new', 'rejected', 'duplicate') then
    raise exception 'Unsupported review status: %', p_status;
  end if;

  update public.open_mic_submissions
  set status = p_status,
      review_notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), review_notes),
      reviewed_at = case when p_status = 'new' then null else now() end
  where id = p_submission_id;

  if not found then
    raise exception 'Submission % was not found', p_submission_id;
  end if;
end;
$$;

-- Pull a listing off the site (or put it back) without deleting the record.
create or replace function public.set_published_open_mic_active(
  p_id text,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Not authorized';
  end if;

  update public.published_open_mics
  set is_active = p_active,
      updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'Published mic % was not found', p_id;
  end if;
end;
$$;

revoke all on function public.approve_open_mic_submission(bigint, jsonb) from public, anon;
revoke all on function public.review_open_mic_submission(bigint, text, text) from public, anon;
revoke all on function public.set_published_open_mic_active(text, boolean) from public, anon;

grant execute on function public.approve_open_mic_submission(bigint, jsonb) to authenticated;
grant execute on function public.review_open_mic_submission(bigint, text, text) to authenticated;
grant execute on function public.set_published_open_mic_active(text, boolean) to authenticated;

comment on function public.approve_open_mic_submission(bigint, jsonb) is
  'Publishes a submission to public.published_open_mics and marks it added. Admins only.';
comment on function public.review_open_mic_submission(bigint, text, text) is
  'Marks a submission rejected/duplicate, or back to new. Admins only.';
comment on function public.set_published_open_mic_active(text, boolean) is
  'Shows or hides an already-published mic on the site. Admins only.';
