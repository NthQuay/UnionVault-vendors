// Pure mapping from Stripe objects to the arguments of the commission SQL functions (20261117_commission_engine.sql).
// All money rules live in SQL; this file only reads Stripe's shapes. Kept free of Deno/Supabase imports so it can be
// unit-tested with Node (supabase/tests/stripe_commission_test.mts).

type Obj = Record<string, any>

const iso = (unixSeconds: unknown): string => new Date((Number(unixSeconds) || Math.floor(Date.now() / 1000)) * 1000).toISOString()
const idOf = (v: unknown): string | null => (typeof v === 'string' ? v : (v as Obj | null)?.id ?? null)

/** Tax on an invoice, across the API versions Stripe has used (older: tax / total_tax_amounts, newer: total_taxes). */
export function taxFromInvoice(inv: Obj): number {
  if (typeof inv.tax === 'number') return inv.tax
  const sum = (a: unknown) => (Array.isArray(a) ? a.reduce((t, x) => t + (Number(x?.amount) || 0), 0) : null)
  return sum(inv.total_tax_amounts) ?? sum(inv.total_taxes) ?? 0
}

/** Billing period of a Stripe price/plan in months (1, 3, 6, 12…), or null if it is not a month/year interval. */
export function planMonths(recurring: Obj | null | undefined): number | null {
  const n = Number(recurring?.interval_count) || 1
  if (recurring?.interval === 'month') return n
  if (recurring?.interval === 'year') return 12 * n
  return null
}
/** Plan of an invoice from its first line, across API versions; also returns the price id when only that is available. */
export function invoicePlan(inv: Obj): { months: number | null; priceId: string | null } {
  const line = inv?.lines?.data?.[0]
  const months = planMonths(line?.price?.recurring) ?? planMonths(line?.plan)
  const priceId = idOf(line?.price) ?? idOf(line?.pricing?.price_details?.price) ?? null
  return { months, priceId }
}

/** invoice.paid → affiliate_record_payment arguments (null when it cannot earn: no customer, nothing paid). */
export function paymentArgs(event: Obj, months: number | null = null): Obj | null {
  const inv = event?.data?.object
  const customer = idOf(inv?.customer)
  if (!inv?.id || !customer || !(Number(inv.amount_paid) > 0)) return null
  return {
    p_event_id: event.id, p_invoice_id: inv.id, p_charge_id: idOf(inv.charge), p_customer_id: customer,
    p_gross_cents: Number(inv.amount_paid), p_tax_cents: taxFromInvoice(inv),
    p_occurred_at: iso(inv.status_transitions?.paid_at ?? event.created), p_currency: String(inv.currency ?? 'aud'), p_plan_months: months,
  }
}

/** invoice.paid → lifecycle log entry (kept for every referred client, whatever the partner's rate). */
export function paymentLifecycleArgs(event: Obj, months: number | null): Obj | null {
  const inv = event?.data?.object
  const customer = idOf(inv?.customer)
  if (!inv?.id || !customer || !(Number(inv.amount_paid) > 0)) return null
  return {
    p_event_id: event.id, p_kind: 'payment', p_customer_id: customer, p_occurred_at: iso(inv.status_transitions?.paid_at ?? event.created),
    p_plan_months: months, p_amount_cents: Number(inv.amount_paid) - taxFromInvoice(inv),
  }
}

/** customer.subscription.updated / deleted → cancellation requested, resumed, or ended (null for any other change). */
export function cancelArgs(event: Obj): Obj | null {
  const sub = event?.data?.object, customer = idOf(sub?.customer)
  if (!customer) return null
  const base = { p_event_id: event.id, p_customer_id: customer, p_plan_months: null, p_amount_cents: null }
  if (event.type === 'customer.subscription.deleted') return { ...base, p_kind: 'cancelled', p_occurred_at: iso(sub.ended_at ?? sub.canceled_at ?? event.created) }
  if (event.type !== 'customer.subscription.updated') return null
  const prev = event?.data?.previous_attributes ?? {}
  let was: boolean, now: boolean
  if ('cancel_at_period_end' in prev) { was = prev.cancel_at_period_end === true; now = sub.cancel_at_period_end === true }
  else if ('cancel_at' in prev) { was = prev.cancel_at != null; now = sub.cancel_at != null }
  else return null
  if (now && !was) return { ...base, p_kind: 'cancel_requested', p_occurred_at: iso(sub.canceled_at ?? event.created) }
  if (!now && was) return { ...base, p_kind: 'resumed', p_occurred_at: iso(event.created) }
  return null
}

/** One succeeded refund → affiliate_record_reversal arguments. The event id is made unique per refund. */
export function refundArgs(event: Obj, refund: Obj, invoiceId: string | null): Obj | null {
  if (refund?.status !== 'succeeded' || !(Number(refund.amount) > 0) || !refund.id) return null
  return {
    p_event_id: `${event.id}:${refund.id}`, p_kind: 'refund', p_ref_id: refund.id, p_invoice_id: invoiceId,
    p_charge_id: idOf(refund.charge), p_amount_cents: Number(refund.amount), p_occurred_at: iso(refund.created ?? event.created),
  }
}

/** A credit note reverses only the part NOT refunded to the card (refunds arrive as their own events). */
export function creditNoteArgs(event: Obj): Obj | null {
  const cn = event?.data?.object
  const amount = (Number(cn?.credit_amount) || 0) + (Number(cn?.out_of_band_amount) || 0)
  if (!cn?.id || !cn.invoice || amount <= 0) return null
  return {
    p_event_id: event.id, p_kind: 'credit_note', p_ref_id: cn.id, p_invoice_id: idOf(cn.invoice),
    p_charge_id: null, p_amount_cents: amount, p_occurred_at: iso(cn.created ?? event.created),
  }
}

/** charge.dispute.closed with status "lost" → reversal. Won / warning disputes change nothing. */
export function disputeArgs(event: Obj, invoiceId: string | null): Obj | null {
  const d = event?.data?.object
  if (event?.type !== 'charge.dispute.closed' || d?.status !== 'lost' || !d.id || !(Number(d.amount) > 0)) return null
  return {
    p_event_id: event.id, p_kind: 'dispute', p_ref_id: d.id, p_invoice_id: invoiceId, p_charge_id: idOf(d.charge),
    p_amount_cents: Number(d.amount), p_occurred_at: iso(d.created ?? event.created),
  }
}

export const COMMISSION_EVENTS = ['invoice.paid', 'charge.refunded', 'charge.dispute.closed', 'credit_note.created']
