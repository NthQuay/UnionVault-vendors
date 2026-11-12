// Vendor-portal side-effects of the shared stripe-webhook function: the account-activity log
// (Users tab in this portal) and the referral-commission ledger (affiliate_record_*). Called
// from the main app's supabase/functions/stripe-webhook/index.ts (NthQuay/UnionVault) after it
// has handled billing, via runVendorPortalLogging — the only export, and the only thing that
// file knows about this module. Self-contained on purpose: no imports from index.ts's half of
// the function, so the two repos can be edited and reasoned about independently even though
// Stripe only ever calls one deployed function (the two files are combined at deploy time).
import { COMMISSION_EVENTS, paymentArgs, paymentLifecycleArgs, cancelArgs, invoicePlan, planMonths, refundArgs, creditNoteArgs, disputeArgs } from './commission.ts'

function sbHeaders(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
}

async function stripeGet(endpoint: string, key: string) {
  const r = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    headers: { Authorization: `Basic ${btoa(key + ':')}` },
  })
  return r.json()
}

// ── Referral commission ─────────────────────────────────────────────────────────────────────
// Every Stripe event is recorded once in stripe_events; the money rules themselves live in SQL
// (affiliate_record_payment / affiliate_record_reversal), which are idempotent, so a retried webhook is harmless.
async function rpc(sbUrl: string, key: string, fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${sbUrl}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
  if (!r.ok) throw new Error(`${fn} failed: ${r.status} ${await r.text()}`)
  const out = await r.json()
  console.log(`commission ${fn}`, args.p_event_id, JSON.stringify(out))
  return out
}

/** The invoice a charge paid for. Works on older API versions (charge.invoice) and newer ones (invoice_payments). */
async function invoiceIdForCharge(charge: Record<string, any>, stripeKey: string): Promise<string | null> {
  if (typeof charge?.invoice === 'string') return charge.invoice
  const pi = typeof charge?.payment_intent === 'string' ? charge.payment_intent : charge?.payment_intent?.id
  if (!pi) return null
  try {
    const r = await stripeGet(`invoice_payments?payment[type]=payment_intent&payment[payment_intent]=${encodeURIComponent(pi)}&limit=1`, stripeKey)
    const inv = r?.data?.[0]?.invoice
    return typeof inv === 'string' ? inv : inv?.id ?? null
  } catch (_) { return null }
}

async function handleCommissionEvent(event: Record<string, any>, sbUrl: string, sbKey: string, stripeKey: string) {
  // whole-event idempotency: skip events already fully processed; re-run ones that failed part-way
  const ins = await fetch(`${sbUrl}/rest/v1/stripe_events`, {
    method: 'POST', headers: { ...sbHeaders(sbKey), 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ event_id: event.id, type: event.type }),
  })
  if (!ins.ok) throw new Error(`stripe_events insert failed: ${ins.status}`)
  const seen = await fetch(`${sbUrl}/rest/v1/stripe_events?event_id=eq.${encodeURIComponent(event.id)}&select=processed_at`, { headers: sbHeaders(sbKey) })
  const row = (await seen.json())?.[0]
  if (row?.processed_at) return

  if (event.type === 'invoice.paid') {
    const inv = event.data.object
    let { months, priceId } = invoicePlan(inv)
    if (months == null && priceId) { try { months = planMonths((await stripeGet(`prices/${encodeURIComponent(priceId)}`, stripeKey))?.recurring) } catch (_) { /* plan stays unknown */ } }
    const life = paymentLifecycleArgs(event, months); if (life) await rpc(sbUrl, sbKey, 'affiliate_record_lifecycle', life)
    const a = paymentArgs(event, months); if (a) await rpc(sbUrl, sbKey, 'affiliate_record_payment', a)
  } else if (event.type === 'charge.refunded') {
    const charge = event.data.object
    const invoiceId = await invoiceIdForCharge(charge, stripeKey)
    const refunds = await stripeGet(`refunds?charge=${encodeURIComponent(charge.id)}&limit=100`, stripeKey)
    for (const rf of refunds?.data ?? []) {
      const a = refundArgs(event, rf, invoiceId); if (a) await rpc(sbUrl, sbKey, 'affiliate_record_reversal', a)
    }
  } else if (event.type === 'credit_note.created') {
    const a = creditNoteArgs(event); if (a) await rpc(sbUrl, sbKey, 'affiliate_record_reversal', a)
  } else if (event.type === 'charge.dispute.closed') {
    const d = event.data.object
    const charge = d?.charge ? await stripeGet(`charges/${encodeURIComponent(typeof d.charge === 'string' ? d.charge : d.charge.id)}`, stripeKey) : null
    const a = disputeArgs(event, charge ? await invoiceIdForCharge(charge, stripeKey) : null)
    if (a) await rpc(sbUrl, sbKey, 'affiliate_record_reversal', a)
  }

  await fetch(`${sbUrl}/rest/v1/stripe_events?event_id=eq.${encodeURIComponent(event.id)}`, {
    method: 'PATCH', headers: { ...sbHeaders(sbKey), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ processed_at: new Date().toISOString() }),
  })
}

// ── Admin account log ───────────────────────────────────────────────────────────────────────
/** Coupon / promotion code applied to a subscription (readable code first, else coupon name or id). */
async function couponOf(subId: string, stripeKey: string): Promise<string | null> {
  try {
    const s = await stripeGet(`subscriptions/${encodeURIComponent(subId)}?expand[]=discounts.promotion_code`, stripeKey)
    const list: Record<string, any>[] = [...(Array.isArray(s?.discounts) ? s.discounts : []), ...(s?.discount ? [s.discount] : [])].filter((d) => d && typeof d === 'object')
    const names = list.map((d) => d.promotion_code?.code ?? d.coupon?.name ?? d.coupon?.id ?? d.source?.coupon?.name ?? d.source?.coupon?.id).filter(Boolean)
    return names.length ? [...new Set(names)].join(', ') : null
  } catch (_) { return null }
}

async function logAccountEvent(event: Record<string, any>, sbUrl: string, sbKey: string, stripeKey: string) {
  const o = event.data?.object ?? {}
  const prev = event.data?.previous_attributes ?? {}
  const at = new Date((Number(event.created) || Math.floor(Date.now() / 1000)) * 1000).toISOString()
  const customer = typeof o.customer === 'string' ? o.customer : o.customer?.id
  const send = (kind: string, extra: Record<string, unknown> = {}, suffix = '') =>
    rpc(sbUrl, sbKey, 'account_event_record', { p_event_id: event.id + suffix, p_kind: kind, p_customer_id: customer ?? null, p_occurred_at: at, ...extra })

  if (event.type === 'checkout.session.completed') {
    if (o.mode !== 'subscription' || !o.subscription) return
    const sub = await stripeGet(`subscriptions/${o.subscription}`, stripeKey)
    const rec = sub?.items?.data?.[0]?.price?.recurring
    await send(sub?.status === 'trialing' ? 'trial_started' : 'subscribed', {
      p_user_id: o.metadata?.user_id ?? null, p_plan_months: planMonths(rec), p_coupon: await couponOf(String(o.subscription), stripeKey),
      p_detail: { status: sub?.status ?? null, trial_end: sub?.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null },
    })
  } else if (event.type === 'customer.subscription.updated') {
    const rec = o.items?.data?.[0]?.price?.recurring
    const months = planMonths(rec)
    if ('items' in prev && months != null) await send('plan_changed', { p_plan_months: months }, ':plan')
    if ('cancel_at_period_end' in prev) {
      await send(o.cancel_at_period_end ? 'cancel_requested' : 'resumed', {
        p_plan_months: months, p_detail: { ends: o.current_period_end ? new Date(o.current_period_end * 1000).toISOString() : null },
      }, ':cancel')
    }
    if (prev.status === 'trialing' && o.status === 'active') await send('subscribed', { p_plan_months: months, p_detail: { note: 'Free trial ended, now paying' } }, ':convert')
    // A coupon/discount added (or changed) directly on an EXISTING subscription — e.g. an admin
    // applying one in the Stripe Dashboard after the original checkout. couponOf() above was only
    // ever read at checkout.session.completed, so a discount attached later never reached
    // account_events, and the Users > Coupon column stayed "—" forever for that account even
    // though Stripe genuinely had the discount on file.
    if ('discount' in prev || 'discounts' in prev) {
      const coupon = await couponOf(o.id as string, stripeKey)
      if (coupon) await send('coupon', { p_plan_months: months, p_coupon: coupon }, ':coupon')
    }
  } else if (event.type === 'customer.subscription.deleted') {
    await send('cancelled', { p_plan_months: planMonths(o.items?.data?.[0]?.price?.recurring) })
  } else if (event.type === 'invoice.paid') {
    if (!(Number(o.amount_paid) > 0)) return
    await send('payment', { p_plan_months: invoicePlan(o).months, p_amount_cents: Number(o.amount_paid), p_detail: { invoice: o.id, currency: o.currency ?? 'aud' } })
  } else if (event.type === 'invoice.payment_failed') {
    await send('payment_failed', { p_amount_cents: Number(o.amount_due) || null, p_detail: { invoice: o.id } })
  }
}

/**
 * Entry point called once per webhook delivery, after index.ts has handled billing.
 *
 * The two pieces here fail differently on purpose, matching how they behaved before this file
 * existed: the commission ledger is retry-safe (stripe_events), so a genuine failure in it is
 * allowed to propagate — the caller returns 500 and Stripe retries the whole event. The account
 * log and the cancel/resume lifecycle note are best-effort and must never turn into a retry or
 * break billing, so their errors are caught and logged here, not thrown.
 */
export async function runVendorPortalLogging(event: Record<string, any>, sbUrl: string, sbKey: string, stripeKey: string) {
  const type = event.type as string

  if (COMMISSION_EVENTS.includes(type)) {
    await handleCommissionEvent(event, sbUrl, sbKey, stripeKey)
  }

  try { await logAccountEvent(event, sbUrl, sbKey, stripeKey) } catch (e) { console.error('account log failed', type, e) }

  if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    try {
      const a = cancelArgs(event)
      if (a) await rpc(sbUrl, sbKey, 'affiliate_record_lifecycle', a)
    } catch (e) { console.error('lifecycle log failed', type, e) }
  }
}
