// Run:  node --experimental-strip-types supabase/tests/vendor_review_test.mts
import { reviewRequest } from '../functions/_shared/vendor-review.ts'
import { approvalEmail, denialEmail, adminAlertEmail } from '../functions/_shared/vendor-email.ts'
import assert from 'node:assert/strict'
const SB = 'https://proj.supabase.co', ID = '11111111-2222-4333-8444-555555555555', ADMIN = 'aaaaaaaa-2222-4333-8444-555555555555', NEWUSER = 'bbbbbbbb-2222-4333-8444-555555555555'
const j = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } })
type Opt = { isAdmin?: boolean; user?: boolean; row?: any; createUser?: number; approve?: any; link?: string; resendOk?: boolean }
function world(o: Opt = {}) {
  const calls: string[] = [], sent: any[] = []
  const f = (async (url: string, init: any = {}) => {
    const u = String(url), body = init.body ? JSON.parse(init.body) : {}
    calls.push(u.replace(SB, '').replace('https://api.resend.com', 'resend'))
    if (u.endsWith('/auth/v1/user')) return o.user === false ? j({}, 401) : j({ id: ADMIN })
    if (u.includes('/rest/v1/app_admins')) return j(o.isAdmin === false ? [] : [{ user_id: ADMIN }])
    if (u.includes('/rest/v1/vendor_requests')) return j('row' in o ? (o.row ? [o.row] : []) : [{ id: ID, status: 'pending', name: 'Sam Carter', business: 'Bloom & Wild', email: 'sam@bloom.test', want_listing: true, want_affiliate: true }])
    if (u.endsWith('/auth/v1/admin/users')) return (o.createUser ?? 200) === 200 ? j({ id: NEWUSER }) : j({ msg: 'exists' }, 422)
    if (u.endsWith('/rpc/auth_user_id_by_email')) return j(NEWUSER)
    if (u.endsWith('/rpc/vendor_request_approve')) return j(o.approve ?? { status: 'approved', code: 'bloom-wild' })
    if (u.endsWith('/rpc/vendor_request_deny')) return j({ status: 'denied' })
    if (u.endsWith('/auth/v1/admin/generate_link')) return j({ action_link: o.link ?? `${SB}/auth/v1/verify?token=t&type=magiclink` })
    if (u.endsWith('/emails')) { sent.push(body); return o.resendOk === false ? j({ message: 'no' }, 422) : j({ id: 'em_1' }) }
    throw new Error('unexpected call ' + u)
  }) as unknown as typeof fetch
  return { calls, sent, d: { fetch: f, sbUrl: SB, sbKey: 'svc', resendKey: 'rk' } }
}
const run = (w: ReturnType<typeof world>, input: any, bearer = 'Bearer jwt') => reviewRequest(w.d, bearer, input)
// who may call
assert.equal((await run(world(), { id: ID, approve: true }, '')).status, 401)
assert.equal((await run(world({ user: false }), { id: ID, approve: true })).status, 401)
assert.equal((await run(world({ isAdmin: false }), { id: ID, approve: true })).body.error, 'admin_only')
let w = world({ isAdmin: false }); await run(w, { id: ID, approve: true }); assert.ok(!w.calls.some((c) => c.includes('admin/users') || c.includes('approve') || c.includes('resend')), 'a non-admin triggers nothing')
// input checks
assert.equal((await run(world(), { id: 'nope', approve: true })).body.error, 'bad_id')
assert.equal((await run(world({ row: null }), { id: ID, approve: true })).status, 404)
assert.equal((await run(world({ row: { id: ID, status: 'approved' } }), { id: ID, approve: true })).status, 409)
// approve: happy path
w = world(); let r = await run(w, { id: ID, approve: true, note: 'Welcome!' })
assert.equal(r.status, 200); assert.equal(r.body.status, 'approved'); assert.equal(r.body.emailed, true)
assert.deepEqual(w.calls.filter((c) => !c.includes('/app_admins') && !c.includes('/vendor_requests') && !c.endsWith('/auth/v1/user')), ['/auth/v1/admin/users', '/rest/v1/rpc/vendor_request_approve', '/auth/v1/admin/generate_link', 'resend/emails'])
assert.equal(w.sent[0].to[0], 'sam@bloom.test'); assert.ok(w.sent[0].from.startsWith('Union Vault Vendors <')); assert.ok(w.sent[0].html.includes('Welcome!') && w.sent[0].html.includes('?ref=bloom-wild') && w.sent[0].html.includes('/auth/v1/verify'))
// approve: person already has an account -> reuse it
w = world({ createUser: 422 }); r = await run(w, { id: ID, approve: true }); assert.equal(r.body.status, 'approved'); assert.ok(w.calls.includes('/rest/v1/rpc/auth_user_id_by_email'))
// approve refused by the database (already a partner) -> no email
w = world({ approve: { status: 'already_partner' } }); r = await run(w, { id: ID, approve: true }); assert.equal(r.status, 409); assert.equal(w.sent.length, 0)
// email failure does not undo the approval
w = world({ resendOk: false }); r = await run(w, { id: ID, approve: true }); assert.equal(r.status, 200); assert.equal(r.body.emailed, false)
// a link that is not ours is never emailed
w = world({ link: 'https://evil.example/auth/v1/verify?x=1' }); r = await run(w, { id: ID, approve: true }); assert.equal(r.body.emailed, false); assert.equal(w.sent.length, 0)
// deny
w = world(); r = await run(w, { id: ID, approve: false, note: 'Not a fit right now' }); assert.equal(r.body.status, 'denied'); assert.equal(r.body.emailed, true)
assert.ok(w.sent[0].html.includes('Not a fit right now') && !w.calls.includes('/auth/v1/admin/users'), 'deny creates no login'); assert.equal(w.sent[0].subject, 'About your Union Vault vendor request')
// emails
const a = approvalEmail({ name: 'Sam Carter', business: 'Bloom & <Wild>', url: `${SB}/auth/v1/verify?a=1&b=2`, note: '<b>hi</b>', wantListing: true, wantAffiliate: false, code: 'x' })
assert.ok(!a.html.includes('<b>hi</b>') && a.html.includes('Bloom &amp; &lt;Wild&gt;') && a.html.includes('a=1&amp;b=2') && !a.html.includes('?ref=') && a.text.includes('a=1&b=2'))
const only = approvalEmail({ name: 'Priya', business: 'Nair', url: SB + '/auth/v1/verify', note: '', wantListing: false, wantAffiliate: true, code: 'nair' }); assert.ok(only.html.includes('?ref=nair') && !only.html.includes('vendor listing'))
assert.ok(!denialEmail({ name: 'A', business: 'B', note: '' }).html.includes('A note from us'))
const al = adminAlertEmail({ name: 'Sam', business: 'Bloom', email: 'sam@bloom.test', phone: '1', website: '', about: '<script>x</script>', wantListing: true, wantAffiliate: true })
assert.ok(!al.html.includes('<script>') && al.html.includes('appear as a vendor + an affiliate link') && al.subject === 'New vendor request: Bloom')
console.log('vendor-request review + emails: all tests passed')
