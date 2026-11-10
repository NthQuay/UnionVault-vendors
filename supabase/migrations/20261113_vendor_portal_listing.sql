-- Vendor portal v2: richer listings (photos, logo, bio, packages & pricing) and all-time click history.
-- NOT applied anywhere yet. Run after 20261110 (main repo), 20261111 (main repo) and 20261112 (this repo).
-- Same rules as before: vendors never write tables directly; everything goes through the review queue.

alter table public.vendor_profiles
  add column if not exists bio              text,
  add column if not exists logo_path        text,
  add column if not exists photos           jsonb   not null default '[]'::jsonb,   -- ordered storage paths, first = cover
  add column if not exists packages         jsonb   not null default '[]'::jsonb,
  add column if not exists packages_visible boolean not null default true;

-- ── storage: public-read bucket; a vendor may only write inside its own folder ─────────────────────────────
-- Files are only shown to couples once a reviewed change references them, and names are random UUIDs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vendor-media', 'vendor-media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists vendor_media_insert on storage.objects;
create policy vendor_media_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'vendor-media' and (storage.foldername(name))[1] = public.my_vendor_id());
drop policy if exists vendor_media_delete on storage.objects;
create policy vendor_media_delete on storage.objects for delete to authenticated using (
  bucket_id = 'vendor-media' and ((storage.foldername(name))[1] = public.my_vendor_id() or public.is_admin()));

-- ── package validation (server-side; the browser checks are only for convenience) ──────────────────────────
create or replace function public.vendor_packages_ok(p jsonb) returns boolean language plpgsql immutable as $$
declare e jsonb; t text;
begin
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 12 then return false; end if;
  for e in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(e) k
               where k <> all (array['name','included','price_type','price_min','price_max','unit','note','visible','popular'])) then return false; end if;
    if jsonb_typeof(e->'name') <> 'string' or length(btrim(e->>'name')) not between 1 and 80 then return false; end if;
    if length(coalesce(e->>'included','')) > 400 or length(coalesce(e->>'note','')) > 80 then return false; end if;
    t := coalesce(e->>'price_type', '');
    if not (t = any (array['fixed','range','from','request'])) then return false; end if;
    if t <> 'request' then
      if jsonb_typeof(e->'price_min') <> 'number' or (e->>'price_min')::numeric not between 0 and 1000000 then return false; end if;
      if t = 'range' and (jsonb_typeof(e->'price_max') <> 'number' or (e->>'price_max')::numeric not between (e->>'price_min')::numeric and 1000000) then return false; end if;
      if not (coalesce(e->>'unit', 'package') = any (array['package','hour','day','person','event'])) then return false; end if;
    end if;
    if e ? 'visible' and jsonb_typeof(e->'visible') <> 'boolean' then return false; end if;
    if e ? 'popular' and jsonb_typeof(e->'popular') <> 'boolean' then return false; end if;
  end loop;
  return true;
end $$;

-- ── vendor: submit an edit for review ───────────────────────────────────────────────────────────────────────
create or replace function public.submit_profile_change(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := public.my_vendor_id(); k text; clean jsonb := '{}'::jsonb; x jsonb;
  texts text[] := array['name','category_label','area','hours','phone','email','website_url','contact_url','instagram_url'];
begin
  if v is null then return jsonb_build_object('ok', false, 'error', 'not_a_partner'); end if;
  for k in select jsonb_object_keys(p) loop
    if k = any (texts) then
      if jsonb_typeof(p->k) <> 'string' or length(p->>k) > 400 then return jsonb_build_object('ok', false, 'error', 'bad_value', 'field', k); end if;
      if k like '%\_url' and (p->>k) <> '' and (p->>k) !~ '^https://' then return jsonb_build_object('ok', false, 'error', 'url_must_be_https', 'field', k); end if;
      clean := clean || jsonb_build_object(k, btrim(p->>k));
    elsif k = 'bio' then
      if jsonb_typeof(p->k) <> 'string' or length(p->>k) > 1500 then return jsonb_build_object('ok', false, 'error', 'bad_value', 'field', k); end if;
      clean := clean || jsonb_build_object(k, btrim(p->>k));
    elsif k = 'packages_visible' then
      if jsonb_typeof(p->k) <> 'boolean' then return jsonb_build_object('ok', false, 'error', 'bad_value', 'field', k); end if;
      clean := clean || jsonb_build_object(k, p->k);
    elsif k = 'packages' then
      if not public.vendor_packages_ok(p->k) then return jsonb_build_object('ok', false, 'error', 'bad_packages'); end if;
      clean := clean || jsonb_build_object(k, p->k);
    elsif k = 'photos' then
      if jsonb_typeof(p->k) <> 'array' or jsonb_array_length(p->k) > 8 then return jsonb_build_object('ok', false, 'error', 'bad_photos'); end if;
      for x in select * from jsonb_array_elements(p->k) loop
        if jsonb_typeof(x) <> 'string' or (x #>> '{}') !~ ('^' || v || '/[0-9a-f-]{36}\.jpg$') then return jsonb_build_object('ok', false, 'error', 'bad_photos'); end if;
      end loop;
      clean := clean || jsonb_build_object(k, p->k);
    elsif k = 'logo_path' then
      if jsonb_typeof(p->k) <> 'string' or ((p->>k) <> '' and (p->>k) !~ ('^' || v || '/[0-9a-f-]{36}\.jpg$')) then return jsonb_build_object('ok', false, 'error', 'bad_logo'); end if;
      clean := clean || jsonb_build_object(k, p->k);
    else
      return jsonb_build_object('ok', false, 'error', 'field_not_editable', 'field', k);
    end if;
  end loop;
  if clean = '{}'::jsonb then return jsonb_build_object('ok', false, 'error', 'nothing_to_change'); end if;
  update public.vendor_profile_changes set status = 'rejected', review_note = 'Replaced by a newer submission', reviewed_at = now()
   where vendor_id = v and status = 'pending';
  insert into public.vendor_profile_changes (vendor_id, proposed, submitted_by) values (v, clean, auth.uid());
  return jsonb_build_object('ok', true);
end $$;

-- ── admin: approve or reject ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.review_profile_change(p_id uuid, p_approve boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.vendor_profile_changes; j jsonb;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'admin_only'); end if;
  select * into c from public.vendor_profile_changes where id = p_id and status = 'pending';
  if not found then return jsonb_build_object('ok', false, 'error', 'not_pending'); end if;
  if p_approve then
    j := c.proposed;
    update public.vendor_profiles set
      name             = coalesce(j->>'name', name),
      mono             = case when j ? 'name' and btrim(j->>'name') <> ''
                              then upper(left(regexp_replace((regexp_split_to_array(btrim(j->>'name'), '\s+'))[1], '[^[:alnum:]]', '', 'g'), 1)
                                      || coalesce(left(regexp_replace((regexp_split_to_array(btrim(j->>'name'), '\s+'))[2], '[^[:alnum:]]', '', 'g'), 1), ''))
                              else mono end,
      category_label   = coalesce(j->>'category_label', category_label),
      area             = coalesce(j->>'area', area),
      hours            = coalesce(j->>'hours', hours),
      phone            = coalesce(j->>'phone', phone),
      email            = coalesce(j->>'email', email),
      bio              = coalesce(j->>'bio', bio),
      logo_path        = case when j ? 'logo_path' then nullif(j->>'logo_path', '') else logo_path end,
      photos           = coalesce(j->'photos', photos),
      packages         = coalesce(j->'packages', packages),
      packages_visible = coalesce((j->>'packages_visible')::boolean, packages_visible),
      updated_at       = now()
    where vendor_id = c.vendor_id;
    insert into public.vendor_links (vendor_id, link, url)
      select c.vendor_id, m.link, j->>m.key from (values ('website','website_url'),('contact','contact_url'),('instagram','instagram_url')) m(link, key)
      where j ? m.key and coalesce(j->>m.key, '') <> ''
    on conflict (vendor_id, link) do update set url = excluded.url, updated_at = now();
  end if;
  update public.vendor_profile_changes set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- ── vendor: all-time daily click counts (the browser works out 7 days / quarter / all time) ───────────────────
create or replace function public.vendor_clicks_all()
returns table (day date, link text, clicks bigint) language sql stable security definer set search_path = public as $$
  select (c.clicked_at at time zone 'Australia/Brisbane')::date, c.link, count(*)
  from public.vendor_clicks c
  where c.vendor_id = public.my_vendor_id() and not c.is_bot
  group by 1, 2 order by 1, 2;
$$;
revoke all on function public.vendor_packages_ok(jsonb), public.vendor_clicks_all() from public, anon;
grant execute on function public.vendor_packages_ok(jsonb), public.vendor_clicks_all() to authenticated;

-- ── public listings now include the richer fields (packages only when the vendor shows them) ─────────────────
create or replace function public.recommended_vendors() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.vendor_id, 'name', v.name, 'cat', v.category, 'catLabel', v.category_label, 'tag', v.tag, 'mono', v.mono,
    'area', v.area, 'hours', v.hours, 'phone', v.phone, 'email', v.email, 'note', v.note, 'byline', v.byline,
    'bio', v.bio, 'logo', v.logo_path, 'photos', v.photos,
    'packages', case when v.packages_visible then (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(v.packages) e where coalesce((e->>'visible')::boolean, true)) else '[]'::jsonb end,
    'rating', case when v.rating_score is null then null else jsonb_build_object('score', v.rating_score, 'count', v.rating_count, 'asOf', to_char(v.rating_as_of, 'YYYY-MM')) end,
    'links', (select coalesce(jsonb_object_agg(l.link, true), '{}'::jsonb) from public.vendor_links l where l.vendor_id = v.vendor_id and l.active)
  ) order by v.sort_order, v.name), '[]'::jsonb)
  from public.vendor_profiles v where v.published;
$$;
