// Vendor requests, approvals, admin ledger — runs the REAL migrations in a local in-memory Postgres (PGlite); nothing touches Supabase.
//   npm install --no-save @electric-sql/pglite && node supabase/tests/vendor_requests.test.mjs
// Needs the main repo checked out next to this one (../UnionVault), or set MAIN_REPO_MIGRATIONS to its supabase/migrations folder.
import { PGlite } from '@electric-sql/pglite'; import fs from 'node:fs'; import assert from 'node:assert/strict';
const V=new URL('../migrations/', import.meta.url).pathname, A=process.env.MAIN_REPO_MIGRATIONS || new URL('../../../UnionVault/supabase/migrations/', import.meta.url).pathname;
const db=new PGlite(); let n=0; const q=async(s,p)=>(await db.query(s,p)).rows; const one=async(s,p)=>(await q(s,p))[0];
const ok=(c,m)=>{n++;assert.ok(c,'FAILED: '+m)};
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
 create schema auth; create table auth.users(id uuid primary key default gen_random_uuid(), email text, created_at timestamptz default now());
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
 grant usage on schema auth to anon, authenticated, service_role; grant usage on schema public to anon, authenticated, service_role;
 create table public.subscriptions(id uuid default gen_random_uuid() primary key, user_id uuid not null unique references auth.users(id) on delete cascade, stripe_customer_id text, status text not null default 'trialing');
 grant select on public.subscriptions to authenticated, service_role;
 create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
 create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;`);
for(const f of [A+'20261110_affiliate_schema.sql',A+'20261111_vendor_clicks.sql',V+'20261112_vendor_portal.sql',V+'20261113_vendor_portal_listing.sql',A+'20261116_retention_and_deletion.sql',A+'20261117_commission_engine.sql',V+'20261118_vendor_login.sql',V+'20261119_vendor_requests.sql']) await db.exec(fs.readFileSync(f,'utf8'));
const as=async(uid,role='authenticated')=>{await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid||''}',false); set role ${role}`)}; const su=()=>db.exec('reset role');
const U=i=>`00000000-0000-0000-0000-${String(i).padStart(12,'0')}`;
const mkuser=async(i,e,age='1 year')=>q(`insert into auth.users(id,email,created_at) values ($1,$2,now()-$3::interval)`,[U(i),e,age]);
await mkuser(9,'admin@t.test'); await q(`insert into public.app_admins values ($1)`,[U(9)]);
await mkuser(1,'ben@t.test'); await q(`insert into public.partners(user_id,code,name,vendor_id,rate) values ($1,'storyline','Storyline','storyline',0.2)`,[U(1)]);
const sub=(o={})=>one(`select public.vendor_request_submit($1,$2,$3,$4,$5,$6,$7::boolean,$8::boolean) r`,[o.name??'Sam Carter',o.business??'Bloom & Wild Florals',o.email??'sam@bloom.test',o.phone??'0412 345 678',o.website??'https://insta.test/bloom',o.about??'Florist in Brisbane',o.l??true,o.a??false]).then(x=>x.r);
// ===== submit =====
for(const [o,why] of [[{name:''},'no name'],[{business:' '},'no business'],[{email:'nope'},'bad email'],[{email:'a b@c.co'},'space in email'],[{phone:''},'no phone'],[{about:''},'no description'],[{l:false,a:false},'neither box'],[{about:'x'.repeat(1001)},'description too long'],[{website:'h'.repeat(201)},'website too long']]) ok((await sub(o)).status==='invalid','invalid: '+why);
const c1=await sub(); ok(c1.status==='created' && c1.id,'valid request created');
ok((await sub()).status==='duplicate','second pending request from the same email');
ok((await sub({email:'SAM@bloom.test'})).status==='duplicate','case-insensitive duplicate');
ok((await sub({email:'ben@t.test'})).status==='already_vendor','an existing vendor cannot request again');
ok((await one(`select count(*)::int c from public.vendor_requests`)).c===1,'only one row stored');
// per-email daily cap (deny the pending one each time so duplicates do not mask it)
for(let i=0;i<2;i++){ await q(`update public.vendor_requests set status='denied' where lower(email)='sam@bloom.test' and status='pending'`); ok((await sub()).status==='created','request '+(i+2)+' of the day'); }
await q(`update public.vendor_requests set status='denied' where lower(email)='sam@bloom.test' and status='pending'`);
ok((await sub()).status==='throttled','4th request from one address in a day is refused');
await q(`delete from public.vendor_requests`);
// ===== approve: three kinds =====
await mkuser(21,'sam@bloom.test'); await mkuser(22,'priya@nair.test'); await mkuser(23,'cat@x.test'); await mkuser(24,'dup@x.test'); await mkuser(25,'sym@x.test'); await mkuser(26,'ab@x.test');
const both=(await sub({email:'sam@bloom.test',business:'Bloom & Wild Florals',l:true,a:true})).id, aff=(await sub({email:'priya@nair.test',business:'Nair Films',l:false,a:true})).id, lst=(await sub({email:'cat@x.test',business:'Cat Cakes',l:true,a:false})).id;
const ap=async(id,uid,note)=>one(`select public.vendor_request_approve($1,$2,$3,$4) r`,[id,uid,U(9),note??null]).then(x=>x.r);
let r=await ap(both,U(21),'Welcome!'); ok(r.status==='approved' && r.code==='bloom-wild-florals','slug from the business name: '+JSON.stringify(r));
let p=await one(`select * from public.partners where user_id=$1`,[U(21)]); ok(p.vendor_id==='bloom-wild-florals' && p.referral_enabled===true && p.rate===null && p.contact_email==='sam@bloom.test' && p.active,'listing + affiliate partner, rate not yet agreed');
let pr=await one(`select * from public.vendor_profiles where vendor_id='bloom-wild-florals'`); ok(pr && pr.published===false && pr.name==='Bloom & Wild Florals' && pr.mono==='BW' && pr.phone==='0412 345 678','unpublished listing created with initials');
r=await ap(aff,U(22)); p=await one(`select * from public.partners where user_id=$1`,[U(22)]); ok(r.status==='approved' && p.vendor_id===null && p.referral_enabled===true,'affiliate-only: no listing');
ok((await one(`select count(*)::int c from public.vendor_profiles where name='Nair Films'`)).c===0,'affiliate-only: no listing row');
r=await ap(lst,U(23)); p=await one(`select * from public.partners where user_id=$1`,[U(23)]); ok(r.status==='approved' && p.vendor_id==='cat-cakes' && p.referral_enabled===false,'listing-only: referral link switched off');
ok((await ap(both,U(21))).status==='not_pending','cannot approve twice');
const d1=(await sub({email:'dup@x.test',business:'Cat Cakes'})).id; r=await ap(d1,U(24)); ok(r.code==='cat-cakes-2','a second "Cat Cakes" gets a unique slug: '+r.code);
const d2=(await sub({email:'sym@x.test',business:'!!!'})).id; r=await ap(d2,U(25)); ok(r.code==='vendor','symbols-only name falls back to "vendor": '+r.code);
const d3=(await sub({email:'ab@x.test',business:'AB'})).id; r=await ap(d3,U(26)); ok(r.code==='abvnd','too-short slug is padded (codes need 3+ characters): '+r.code);
const d4=(await sub({email:'again@x.test',business:'Again'})).id; ok((await ap(d4,U(21))).status==='already_partner','a login that is already a partner cannot be linked twice');
// ===== deny =====
const d5=(await one(`select public.vendor_request_submit('A','Deny Me','deny@x.test','1','', 'x',true,false) r`)).r.id;
ok((await one(`select public.vendor_request_deny($1,$2,'Not a fit') r`,[d5,U(9)])).r.status==='denied','denied');
ok((await one(`select public.vendor_request_deny($1,$2,'x') r`,[d5,U(9)])).r.status==='not_pending','cannot deny twice');
const row=await one(`select status, review_note, reviewed_by from public.vendor_requests where id=$1`,[d5]); ok(row.review_note==='Not a fit' && row.reviewed_by===U(9),'note and reviewer recorded');
// ===== referral links respect the choice =====
await mkuser(31,'fresh1@x.test','1 hour'); await mkuser(32,'fresh2@x.test','1 hour'); await mkuser(33,'fresh3@x.test','1 hour');
await as(U(31)); ok((await one(`select public.claim_referral('bloom-wild-florals', now() - interval '2 hours') r`)).r.status==='attributed','affiliate ticked: the link works');
await su(); await as(U(32)); ok((await one(`select public.claim_referral('cat-cakes', now() - interval '2 hours') r`)).r.error==='invalid_code','listing-only partner: the referral link is not valid');
await su(); await as(U(33)); ok((await one(`select public.claim_referral('nair-films', now() - interval '2 hours') r`)).r.status==='attributed','affiliate-only partner: the link works'); await su();
// ===== portal summary flags =====
await as(U(23)); let s=(await one(`select public.partner_summary() r`)).r; ok(s.has_listing===true && s.referral_enabled===false && s.name==='Cat Cakes','summary: listing, no referral');
await su(); await as(U(22)); s=(await one(`select public.partner_summary() r`)).r; ok(s.has_listing===false && s.referral_enabled===true,'summary: referral, no listing'); await su();
// ===== who may read what =====
await as(U(9)); ok((await q(`select * from public.admin_vendor_requests()`)).length>=7,'admin sees requests'); const first=(await q(`select status from public.admin_vendor_requests()`)); ok(first[0].status==='pending'||first.every(x=>x.status!=='pending'),'pending first');
await su(); await as(U(1)); ok((await q(`select * from public.admin_vendor_requests()`)).length===0,'a partner sees no requests');
let denied=false; try{ await q(`select * from public.vendor_requests`)}catch(e){denied=true} ok(denied,'the table cannot be read directly');
denied=false; try{ await q(`select public.vendor_request_submit('a','b','c@d.co','1','','x',true,false)`)}catch(e){denied=true} ok(denied,'partners cannot call the submit writer');
await su(); await as(null,'anon'); denied=false; try{ await q(`select public.vendor_request_approve(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null)`)}catch(e){denied=true} ok(denied,'anon cannot approve'); await su();
// ===== admin ledger =====
const ref=await one(`select r.id, r.partner_id from public.referrals r join auth.users u on u.id=r.user_id where u.email='fresh1@x.test'`);
await q(`insert into public.commission_entries(partner_id,referral_id,kind,stripe_event_id,stripe_invoice_id,gross_cents,tax_cents,basis,rate,commission_cents,occurred_at,period_start,plan_months) values ($1,$2,'payment','e1','i1',1299,0,'ex_tax',0.2,260,now(),public.affiliate_quarter_start(now()),1)`,[ref.partner_id,ref.id]);
await q(`insert into public.referral_events(referral_id,kind,stripe_event_id,occurred_at,plan_months,amount_cents) values ($1,'payment','e1',now(),1,1299),($1,'cancelled','e2',now(),null,null)`,[ref.id]);
await as(U(9)); const cl=await q(`select * from public.admin_partner_clients($1)`,[ref.partner_id]); ok(cl.length===1 && cl[0].email==='fresh1@x.test' && cl[0].plan_months===1 && cl[0].cancel_state==='ended','admin sees the client with email, plan and cancellation');
const lg=await q(`select * from public.admin_partner_ledger($1,null)`,[ref.partner_id]); ok(lg.some(l=>l.kind==='first'&&l.email==='fresh1@x.test'&&Number(l.commission_cents)===260) && lg.some(l=>l.kind==='cancelled'),'admin ledger has the payment (with email) and the cancellation');
ok((await q(`select * from public.admin_partner_ledger($1,'2020-01-01')`,[ref.partner_id])).length===0,'quarter filter');
await su(); await as(U(1)); ok((await q(`select * from public.admin_partner_clients($1)`,[ref.partner_id])).length===0 && (await q(`select * from public.admin_partner_ledger($1,null)`,[ref.partner_id])).length===0,'a partner cannot use the admin ledger'); await su();
console.log(`ALL ${n} VENDOR REQUEST CHECKS PASSED`);
