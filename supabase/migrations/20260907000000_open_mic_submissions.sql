-- "Add Your Mic" submissions from the public form on stagetimepnw.com/add-mic.
--
-- The form posts to the submit-open-mic edge function, which validates the
-- payload, inserts the row with the service role, and emails the admin via
-- Resend. Nothing but service_role can read or write this table. Review
-- submissions in the Supabase table editor or with
--   node scripts/pull-open-mic-submissions.mjs
-- The `record` column is already shaped like an entry in data/open-mics.json
-- (minus latitude/longitude, which scripts/geocode-open-mics.mjs fills in).

create table if not exists public.open_mic_submissions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),

  -- Review workflow (admin-only columns; the form cannot set these)
  status text not null default 'new'
    check (status in ('new', 'added', 'rejected', 'duplicate')),
  reviewed_at timestamptz,
  review_notes text,

  -- Admin email notification, set by the submit-open-mic edge function
  notified_at timestamptz,
  notify_error text,

  -- Who sent it (never shown publicly)
  submitter_name text not null check (char_length(submitter_name) between 1 and 120),
  submitter_email text not null check (char_length(submitter_email) between 3 and 254),
  submitter_instagram text check (submitter_instagram is null or char_length(submitter_instagram) <= 120),
  submitter_role text check (submitter_role is null or submitter_role in ('host', 'booker', 'venue', 'performer', 'other')),
  submitter_notes text check (submitter_notes is null or char_length(submitter_notes) <= 4000),

  -- Flattened highlights for the table view
  mic_name text not null check (char_length(mic_name) between 1 and 160),
  venue text check (venue is null or char_length(venue) <= 160),
  location text not null check (char_length(location) between 3 and 300),
  days text[] not null default '{}',
  recurrence_text text,
  signup_time text,
  start_time text,
  end_time text,
  signup_type text check (signup_type is null or signup_type in ('in-person', 'online', 'both')),
  web_signup text,
  open_mic_type text,
  age_requirement text,
  price text,
  host text,
  flyer_url text check (flyer_url is null or flyer_url ~* '^https://'),

  -- Ready-to-paste open-mics.json record
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  page_url text
);

comment on table public.open_mic_submissions is
  'Open mic listings submitted through the public "Add Your Mic" form. record = open-mics.json entry.';

create index if not exists open_mic_submissions_status_created_idx
  on public.open_mic_submissions (status, created_at);

alter table public.open_mic_submissions enable row level security;

-- Service role only. The browser never touches this table directly; the
-- submit-open-mic edge function inserts on its behalf. With RLS on and no
-- policies, anon/authenticated are denied even if a grant slipped through.
revoke all on table public.open_mic_submissions from anon, authenticated;
grant all on table public.open_mic_submissions to service_role;

-- Flyer images. Public bucket so approved flyers can be linked from the site.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'open-mic-flyers',
  'open-mic-flyers',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "open mic flyers are uploadable by anyone" on storage.objects;
create policy "open mic flyers are uploadable by anyone"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'open-mic-flyers');

drop policy if exists "open mic flyers are publicly readable" on storage.objects;
create policy "open mic flyers are publicly readable"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'open-mic-flyers');
