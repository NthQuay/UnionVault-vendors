// Approve / deny a vendor request. Pure logic with injected dependencies so it can be tested without Deno or Supabase.
import { approvalEmail, denialEmail, isSafeLink } from './vendor-email.ts'

export type Deps = { fetch: typeof fetch; sbUrl: string; sbKey: string; resendKey: string }
const PORTAL = 'https://vendors.unionvault.app/'
const FROM = 'Union Vault Vendors <vendors@unionvault.app>'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
type Out = { status: number; body: Record<string, unknown> }
const fail = (status: number, error: string): Out => ({ status, body: { ok: false, error } })

export async function sendMail(d: Deps, to: string, m: { subject: string; html: string; text: string }): Promise<boolean> {
  try {
    const r = await d.fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${d.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject: m.subject, html: m.html, text: m.text, reply_to: 'support@unionvault.app' }) })
    if (!r.ok) console.error('Resend error', r.status, await r.text())
    return r.ok
  } catch (e) { console.error('Resend failed', e); return false }
}

export async function reviewRequest(d: Deps, bearer: string, input: { id?: unknown; approve?: unknown; note?: unknown }): Promise<Out> {
  const sh = { apikey: d.sbKey, Authorization: `Bearer ${d.sbKey}`, 'Content-Type': 'application/json' }
  const rpc = async (fn: string, args: Record<string, unknown>) => (await d.fetch(`${d.sbUrl}/rest/v1/rpc/${fn}`, { method: 'POST', headers: sh, body: JSON.stringify(args) })).json()

  // 1. who is calling? must be a signed-in admin
  if (!bearer) return fail(401, 'not_signed_in')
  const ur = await d.fetch(`${d.sbUrl}/auth/v1/user`, { headers: { apikey: d.sbKey, Authorization: bearer } })
  const me = ur.ok ? await ur.json() : null
  if (!me?.id) return fail(401, 'not_signed_in')
  const adm = await (await d.fetch(`${d.sbUrl}/rest/v1/app_admins?user_id=eq.${encodeURIComponent(me.id)}&select=user_id`, { headers: sh })).json()
  if (!Array.isArray(adm) || !adm.length) return fail(403, 'admin_only')

  // 2. the request
  const id = String(input.id ?? ''), approve = input.approve === true, note = String(input.note ?? '').slice(0, 500)
  if (!UUID.test(id)) return fail(400, 'bad_id')
  const rows = await (await d.fetch(`${d.sbUrl}/rest/v1/vendor_requests?id=eq.${id}&select=*`, { headers: sh })).json()
  const req = Array.isArray(rows) ? rows[0] : null
  if (!req) return fail(404, 'not_found')
  if (req.status !== 'pending') return fail(409, 'already_decided')

  if (!approve) {
    const r = await rpc('vendor_request_deny', { p_id: id, p_admin: me.id, p_note: note })
    if (r?.status !== 'denied') return fail(409, String(r?.status ?? 'failed'))
    const emailed = await sendMail(d, req.email, denialEmail({ name: req.name, business: req.business, note }))
    return { status: 200, body: { ok: true, status: 'denied', emailed } }
  }

  // 3. approve: make sure there is a login, then create the partner (and listing)
  let uid: string | null = null
  const cr = await d.fetch(`${d.sbUrl}/auth/v1/admin/users`, { method: 'POST', headers: sh, body: JSON.stringify({ email: req.email, email_confirm: true, user_metadata: { vendor_portal: true } }) })
  if (cr.ok) uid = (await cr.json())?.id ?? null
  else uid = await rpc('auth_user_id_by_email', { p_email: req.email })            // already has an account (for example as a couple)
  if (typeof uid !== 'string' || !UUID.test(uid)) return fail(502, 'could_not_create_login')
  const ap = await rpc('vendor_request_approve', { p_id: id, p_user_id: uid, p_admin: me.id, p_note: note })
  if (ap?.status !== 'approved') return fail(409, String(ap?.status ?? 'failed'))

  // 4. welcome email with a one-time sign-in link
  let emailed = false
  try {
    const gl = await d.fetch(`${d.sbUrl}/auth/v1/admin/generate_link`, { method: 'POST', headers: sh, body: JSON.stringify({ type: 'magiclink', email: req.email, redirect_to: PORTAL }) })
    const link = gl.ok ? (await gl.json())?.action_link as string : ''
    if (link && isSafeLink(link, d.sbUrl)) emailed = await sendMail(d, req.email, approvalEmail({ name: req.name, business: req.business, url: link, note, wantListing: !!req.want_listing, wantAffiliate: !!req.want_affiliate, code: ap.code }))
  } catch (e) { console.error('welcome email failed', e) }
  return { status: 200, body: { ok: true, status: 'approved', emailed, code: ap.code } }
}
