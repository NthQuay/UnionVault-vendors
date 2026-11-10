-- The app needs each listing's public website address (to show it on a saved vendor and to recognise it).
-- It is a public business website, and the click tracker still only ever redirects to what is stored in
-- vendor_links, so exposing it here does not create an open redirect.
-- STATUS: applied to production on 2026-11-10.
create or replace function public.recommended_vendors() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.vendor_id, 'name', v.name, 'cat', v.category, 'catLabel', v.category_label, 'tag', v.tag, 'mono', v.mono,
    'area', v.area, 'hours', v.hours, 'phone', v.phone, 'email', v.email, 'note', v.note, 'byline', v.byline,
    'bio', v.bio, 'logo', v.logo_path, 'photos', v.photos,
    'siteUrl', (select l.url from public.vendor_links l where l.vendor_id = v.vendor_id and l.active and l.link in ('website','book','instagram')
                order by case l.link when 'website' then 1 when 'book' then 2 else 3 end limit 1),
    'packages', case when v.packages_visible then (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(v.packages) e where coalesce((e->>'visible')::boolean, true)) else '[]'::jsonb end,
    'rating', case when v.rating_score is null then null else jsonb_build_object('score', v.rating_score, 'count', v.rating_count, 'asOf', to_char(v.rating_as_of, 'YYYY-MM')) end,
    'links', (select coalesce(jsonb_object_agg(l.link, true), '{}'::jsonb) from public.vendor_links l where l.vendor_id = v.vendor_id and l.active)
  ) order by v.sort_order, v.name), '[]'::jsonb)
  from public.vendor_profiles v where v.published;
$$;
