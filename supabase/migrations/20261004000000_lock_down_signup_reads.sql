-- Stop anyone from reading the request list (names, emails, phones, Instagram) with the public key.
--
-- Before: SELECT policies "Anyone can select signups" (using true) and "Verified signups are public"
-- let any visitor read every request, and the table was in the realtime publication, so new rows could
-- also be streamed to anyone the read rules allowed.
--
-- After:
--   * Visitors (anon) can read only the `id` column. The old stagetimepnw.com form saves a request and reads
--     back its id (insert ... select('id')), which needs exactly that.
--   * Signed-in comics keep "Authenticated users can read their own signup" (their own row only).
--   * Server code (service role) and SECURITY DEFINER functions are unaffected.
--   * The table leaves the realtime publication (nothing subscribes to it).
-- Insert policies are unchanged.

begin;

drop policy if exists "Anyone can select signups" on public.signups;
drop policy if exists "Verified signups are public" on public.signups;

revoke select on public.signups from anon;
grant select (id) on public.signups to anon;

create policy "Visitors can read signup ids" on public.signups
  for select to anon using (true);

alter publication supabase_realtime drop table public.signups;

commit;

-- Undo (only if something breaks):
--   begin;
--   drop policy if exists "Visitors can read signup ids" on public.signups;
--   grant select on public.signups to anon;
--   create policy "Anyone can select signups" on public.signups for select to public using (true);
--   create policy "Verified signups are public" on public.signups for select to public using (is_verified = true);
--   alter publication supabase_realtime add table public.signups;
--   commit;
