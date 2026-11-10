-- Vendor portal (vendors.unionvault.app) — database changes. NOT applied anywhere yet.
-- Depends on 20261110_affiliate_schema.sql (partners, referrals, commission_entries, is_admin) and
-- 20261111_vendor_clicks.sql (vendor_links, vendor_clicks). Same Supabase project as the app.
-- Writes happen only through the security-definer functions below (or the service role); vendors can
-- never write a table directly. Vendors see only their own rows; referred users are anonymous IDs.

-- ── link a partner (login) to its vendor listing ───────────────────────────────────────
alter table public.partners add column if not exists vendor_id text unique
  check (vendor_id is null or vendor_id ~ '^[a-z0-9_-]{1,40}$');

-- ── listings: what couples see on Recommended vendors (replaces the hard-coded list) ────
create table if not exists public.vendor_profiles (
  vendor_id      text primary key check (vendor_id ~ '^[a-z0-9_-]{1,40}$'),
  name           text not null,
  category       text not null,                 -- directory category, e.g. 'Celebrants'
  category_label text not null,                 -- e.g. 'Marriage Celebrant & MC'
  tag            text not null default 'Preferred vendor',
  mono           text,                          -- two-letter monogram
  area           text,
  hours          text,
  phone          text,
  email          text,
  -- admin-controlled (a vendor cannot change these):
  note           text,                          -- the couple's review-style note
  byline         text,
  rating_score   numeric(2,1) check (rating_score between 0 and 5),
  rating_count   int,
  rating_as_of   date,
  published      boolean not null default false,
  sort_order     int not null default 100,
  updated_at     timestamptz not null default now()
);
alter table public.vendor_profiles enable row level security;
drop policy if exists vendor_profiles_read on public.vendor_profiles;
create policy vendor_profiles_read on public.vendor_profiles for select using (
  public.is_admin() or vendor_id in (select vendor_id from public.partners where user_id = auth.uid()));

-- ── proposed edits (review queue) ──────────────────────────────────────────────────────
create table if not exists public.vendor_profile_changes (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    text not null references public.vendor_profiles(vendor_id) on delete cascade,
  proposed     jsonb not null,                  -- only whitelisted keys (see submit_profile_change)
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  reviewed_by  uuid references auth.users(id) on delete set null,
  reviewed_at  timestamptz,
  review_note  text
);
create index if not exists vpc_status_idx on public.vendor_profile_changes (status, submitted_at);
alter table public.vendor_profile_changes enable row level security;
drop policy if exists vpc_read on public.vendor_profile_changes;
create policy vpc_read on public.vendor_profile_changes for select using (
  public.is_admin() or vendor_id in (select vendor_id from public.partners where user_id = auth.uid()));

-- ── who clicked (admin only): signed-in users are recorded; vendors only ever see an anonymous ID ──
alter table public.vendor_clicks add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists vendor_clicks_user_idx on public.vendor_clicks (user_id) where user_id is not null;

-- ── terms: versioned, accepted per partner ────────────────────────────────────────────────
create table if not exists public.partner_terms (
  id             uuid primary key default gen_random_uuid(),
  version        text not null unique,
  title          text not null,
  body_md        text not null,
  effective_from date not null default current_date,
  created_at     timestamptz not null default now()
);
create table if not exists public.partner_terms_acceptances (
  partner_id  uuid not null references public.partners(id) on delete cascade,
  terms_id    uuid not null references public.partner_terms(id),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz not null default now(),
  primary key (partner_id, terms_id)
);
alter table public.partner_terms enable row level security;
alter table public.partner_terms_acceptances enable row level security;
drop policy if exists pt_read on public.partner_terms;
create policy pt_read on public.partner_terms for select using (auth.uid() is not null);      -- any signed-in partner may read the terms
drop policy if exists pta_read on public.partner_terms_acceptances;
create policy pta_read on public.partner_terms_acceptances for select using (
  public.is_admin() or partner_id in (select id from public.partners where user_id = auth.uid()));

revoke all on public.vendor_profiles, public.vendor_profile_changes, public.partner_terms, public.partner_terms_acceptances from anon, authenticated;
grant select on public.vendor_profiles, public.vendor_profile_changes, public.partner_terms, public.partner_terms_acceptances to authenticated;

-- ── helper: the signed-in partner's vendor id ─────────────────────────────────────────────────
create or replace function public.my_vendor_id() returns text language sql stable security definer set search_path = public as $$
  select vendor_id from public.partners where user_id = auth.uid() and active;
$$;

-- ── vendor: submit an edit for review (whitelisted fields only, validated) ─────────────────────────
create or replace function public.submit_profile_change(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := public.my_vendor_id(); k text; clean jsonb := '{}'::jsonb;
  allowed text[] := array['name','category_label','area','hours','phone','email','website_url','contact_url','instagram_url'];
begin
  if v is null then return jsonb_build_object('ok', false, 'error', 'not_a_partner'); end if;
  for k in select jsonb_object_keys(p) loop
    if k <> all (allowed) then return jsonb_build_object('ok', false, 'error', 'field_not_editable', 'field', k); end if;
    if jsonb_typeof(p->k) <> 'string' or length(p->>k) > 400 then return jsonb_build_object('ok', false, 'error', 'bad_value', 'field', k); end if;
    if k like '%\_url' and (p->>k) <> '' and (p->>k) !~ '^https://' then return jsonb_build_object('ok', false, 'error', 'url_must_be_https', 'field', k); end if;
    clean := clean || jsonb_build_object(k, btrim(p->>k));
  end loop;
  if clean = '{}'::jsonb then return jsonb_build_object('ok', false, 'error', 'nothing_to_change'); end if;
  update public.vendor_profile_changes set status = 'rejected', review_note = 'Replaced by a newer submission', reviewed_at = now()
   where vendor_id = v and status = 'pending';
  insert into public.vendor_profile_changes (vendor_id, proposed, submitted_by) values (v, clean, auth.uid());
  return jsonb_build_object('ok', true);
end $$;

-- ── admin: approve or reject (applies the change to the listing and the redirect table) ─────────────────
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
      name           = coalesce(j->>'name', name),
      category_label = coalesce(j->>'category_label', category_label),
      area           = coalesce(j->>'area', area),
      hours          = coalesce(j->>'hours', hours),
      phone          = coalesce(j->>'phone', phone),
      email          = coalesce(j->>'email', email),
      updated_at     = now()
    where vendor_id = c.vendor_id;
    -- destinations for the tracked buttons
    insert into public.vendor_links (vendor_id, link, url)
      select c.vendor_id, m.link, j->>m.key from (values ('website','website_url'),('contact','contact_url'),('instagram','instagram_url')) m(link, key)
      where j ? m.key and coalesce(j->>m.key, '') <> ''
    on conflict (vendor_id, link) do update set url = excluded.url, updated_at = now();
  end if;
  update public.vendor_profile_changes set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- ── vendor: accept the current terms ───────────────────────────────────────────────────────────────────
create or replace function public.accept_terms(p_terms uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select id into pid from public.partners where user_id = auth.uid() and active;
  if pid is null then return jsonb_build_object('ok', false, 'error', 'not_a_partner'); end if;
  insert into public.partner_terms_acceptances (partner_id, terms_id, accepted_by) values (pid, p_terms, auth.uid())
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- ── vendor: their own click numbers (counts by day and button) and a recent-clicks list with anonymous IDs ──
create or replace function public.vendor_click_summary(p_days int default 30)
returns table (day date, link text, clicks bigint) language sql stable security definer set search_path = public as $$
  select (c.clicked_at at time zone 'Australia/Brisbane')::date, c.link, count(*)
  from public.vendor_clicks c
  where c.vendor_id = public.my_vendor_id() and not c.is_bot
    and c.clicked_at > now() - make_interval(days => least(greatest(p_days, 1), 366))
  group by 1, 2 order by 1, 2;
$$;
create or replace function public.vendor_recent_clicks(p_limit int default 50)
returns table (clicked_at timestamptz, link text, visitor_id text) language sql stable security definer set search_path = public as $$
  select c.clicked_at, c.link,
         case when c.user_id is null then 'guest' else substr(md5(c.user_id::text || c.vendor_id), 1, 8) end   -- salted per vendor
  from public.vendor_clicks c
  where c.vendor_id = public.my_vendor_id() and not c.is_bot
  order by c.clicked_at desc limit least(greatest(p_limit, 1), 200);
$$;

-- ── admin: every partner at a glance, and who clicked ─────────────────────────────────────────────────────
create or replace function public.admin_partner_overview(p_days int default 30)
returns table (partner_id uuid, name text, vendor_id text, clicks bigint, contact_form bigint, calls_emails bigint,
               signups bigint, paying bigint, commission_cents bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.vendor_id,
    (select count(*) from public.vendor_clicks c where c.vendor_id = p.vendor_id and not c.is_bot and c.clicked_at > now() - make_interval(days => p_days)),
    (select count(*) from public.vendor_clicks c where c.vendor_id = p.vendor_id and c.link = 'contact' and not c.is_bot and c.clicked_at > now() - make_interval(days => p_days)),
    (select count(*) from public.vendor_clicks c where c.vendor_id = p.vendor_id and c.link in ('call','email') and not c.is_bot and c.clicked_at > now() - make_interval(days => p_days)),
    (select count(*) from public.referrals r where r.partner_id = p.id and r.status = 'attributed'),
    (select count(*) from public.referrals r join public.subscriptions s on s.user_id = r.user_id where r.partner_id = p.id and r.status = 'attributed' and s.status = 'active'),
    coalesce((select sum(commission_cents) from public.commission_entries e where e.partner_id = p.id), 0)
  from public.partners p where public.is_admin() order by p.name;
$$;
create or replace function public.admin_recent_clicks(p_vendor text default null, p_limit int default 100)
returns table (clicked_at timestamptz, vendor_id text, link text, user_email text, is_bot boolean)
language sql stable security definer set search_path = public as $$
  select c.clicked_at, c.vendor_id, c.link, u.email, c.is_bot
  from public.vendor_clicks c left join auth.users u on u.id = c.user_id
  where public.is_admin() and (p_vendor is null or c.vendor_id = p_vendor)
  order by c.clicked_at desc limit least(greatest(p_limit, 1), 500);
$$;

-- ── public: the listings the app shows (published only, no internal fields) ─────────────────────────────────
create or replace function public.recommended_vendors() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.vendor_id, 'name', v.name, 'cat', v.category, 'catLabel', v.category_label, 'tag', v.tag, 'mono', v.mono,
    'area', v.area, 'hours', v.hours, 'phone', v.phone, 'email', v.email, 'note', v.note, 'byline', v.byline,
    'rating', case when v.rating_score is null then null else jsonb_build_object('score', v.rating_score, 'count', v.rating_count, 'asOf', to_char(v.rating_as_of, 'YYYY-MM')) end,
    'links', (select coalesce(jsonb_object_agg(l.link, true), '{}'::jsonb) from public.vendor_links l where l.vendor_id = v.vendor_id and l.active)
  ) order by v.sort_order, v.name), '[]'::jsonb)
  from public.vendor_profiles v where v.published;
$$;

-- ── privileges for the functions ─────────────────────────────────────────────────────────────────────────
revoke all on function public.my_vendor_id(), public.submit_profile_change(jsonb), public.review_profile_change(uuid, boolean, text),
  public.accept_terms(uuid), public.vendor_click_summary(int), public.vendor_recent_clicks(int),
  public.admin_partner_overview(int), public.admin_recent_clicks(text, int) from public, anon;
grant execute on function public.my_vendor_id(), public.submit_profile_change(jsonb), public.review_profile_change(uuid, boolean, text),
  public.accept_terms(uuid), public.vendor_click_summary(int), public.vendor_recent_clicks(int),
  public.admin_partner_overview(int), public.admin_recent_clicks(text, int) to authenticated;
grant execute on function public.recommended_vendors() to anon, authenticated;

-- ── seed the two existing vendors (unpublished until you flip published = true after the app reads from here) ──
insert into public.vendor_profiles (vendor_id, name, category, category_label, mono, area, hours, phone, email, note, byline, rating_score, rating_count, rating_as_of, published, sort_order) values
 ('storyline','Storyline Ceremonies','Celebrants','Marriage Celebrant & MC','SC',
  'Ceremony at a location of your choice. $2 per km outside a 40km radius of Brisbane’s CBD.','Open daily 9:30am–4:30pm','0475 296 057','ben@storylineceremonies.com.au',
  'Warm from our very first conversation. Ben was our celebrant and MC — joyful, perfectly on time and incredibly organised. We can’t recommend him highly enough.','— Liam & Mandy',5.0,9,'2026-11-01',false,10),
 ('jordanleef','Jordan Leef Photography','Photographers','Photographer','JL','Brisbane, Gold Coast & Sunshine Coast',null,null,null,
  'Jordan put us completely at ease — it felt like being photographed by a close friend. Seamless guidance on the day and photos that are a true work of art. Stop hesitating, you won’t regret it.','— Liam & Mandy',null,null,null,false,20)
on conflict (vendor_id) do nothing;
