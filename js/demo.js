// Sample data for design review only: open the site with ?demo=vendor or ?demo=admin. No network, no real data.
window.PORTAL_DEMO = function (kind) {
  const days = []; const base = new Date(); base.setHours(0, 0, 0, 0);
  const N = 110, sample = Array.from({ length: N }, (_, i) => Math.max(0, Math.round(2 + i * 0.12 + 3 * Math.sin(i / 2.3) + ((i * 7) % 5))));
  sample.forEach((n, i) => {
    const d = new Date(base); d.setDate(d.getDate() - (N - 1 - i)); const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    days.push({ day: iso, link: 'website', clicks: Math.round(n * 0.55) }, { day: iso, link: 'contact', clicks: Math.round(n * 0.2) }, { day: iso, link: 'call', clicks: Math.round(n * 0.15) }, { day: iso, link: 'email', clicks: Math.round(n * 0.1) });
  });
  const now = Date.now();
  const recent = ['website','contact','call','website','email','website','instagram','website'].map((l, i) => ({ clicked_at: new Date(now - i * 5400000).toISOString(), link: l, visitor_id: i % 3 === 0 ? 'guest' : ['a4f19c02','7be3d81a','c09e5512','12dd9a47'][i % 4] }));
  const profile = { vendor_id: 'storyline', name: 'Storyline Ceremonies', category: 'Celebrants', category_label: 'Marriage Celebrant & MC', area: 'Ceremony at a location of your choice. $2 per km outside a 40km radius of Brisbane’s CBD.', hours: 'Open daily 9:30am–4:30pm', phone: '0475 296 057', email: 'ben@storylineceremonies.com.au', published: true, tag: 'Preferred vendor', rating_score: 5, rating_count: 9,
    bio: 'Warm, organised and always on time. Ben marries couples anywhere in South East Queensland, with ceremonies that feel like you.',
    photos: ["data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23d9b98c'/%3E%3Cstop offset='1' stop-color='%238b6e3a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='4' height='3' fill='url(%23g)'/%3E%3C/svg%3E", "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23a9b8a0'/%3E%3Cstop offset='1' stop-color='%234a6b52'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='4' height='3' fill='url(%23g)'/%3E%3C/svg%3E", "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23e3c6c0'/%3E%3Cstop offset='1' stop-color='%23a6666a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='4' height='3' fill='url(%23g)'/%3E%3C/svg%3E", "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23b6bfd3'/%3E%3Cstop offset='1' stop-color='%2356628a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='4' height='3' fill='url(%23g)'/%3E%3C/svg%3E"], logo_path: '',
    packages_visible: true, packages: [
      { name: 'Classic ceremony', included: 'Meeting + planning call · Personalised ceremony script · Legal paperwork · Up to 45 mins', price_type: 'range', price_min: 950, price_max: 1250, unit: 'package', note: 'GST included', visible: true, popular: false },
      { name: 'Ceremony + MC', included: 'Everything in Classic · MC for your reception · Run sheet & timings', price_type: 'fixed', price_min: 1800, unit: 'package', note: '', visible: true, popular: true },
      { name: 'Extra MC time', included: 'Add-on for longer receptions', price_type: 'fixed', price_min: 120, unit: 'hour', note: '', visible: true, popular: false },
      { name: 'Elopement', included: '', price_type: 'request', unit: 'package', note: '', visible: false, popular: false }] };
  const R = {
    is_admin: kind === 'admin',
    my_vendor_id: 'storyline',
    partner_summary: kind === 'admin' ? null : { name: 'Storyline Ceremonies', code: 'storyline', rate: 0.2, signups: 19, active_subscribers: 7, earned_cents: 3840, unpaid_cents: 3840, paid_cents: 0 },
    partner_referrals: [{ anon_id: 'a4f19c02', signed_up_at: '2026-11-02', subscription_status: 'active' }, { anon_id: '7be3d81a', signed_up_at: '2026-10-30', subscription_status: 'trialing' }, { anon_id: 'c09e5512', signed_up_at: '2026-10-24', subscription_status: 'active' }, { anon_id: '12dd9a47', signed_up_at: '2026-10-19', subscription_status: 'none' }],
    vendor_clicks_all: days, vendor_recent_clicks: recent,
    admin_partner_overview: [{ partner_id: '1', name: 'Storyline Ceremonies', vendor_id: 'storyline', clicks: 214, contact_form: 41, calls_emails: 55, signups: 19, paying: 7, commission_cents: 3840 }, { partner_id: '2', name: 'Jordan Leef Photography', vendor_id: 'jordanleef', clicks: 171, contact_form: 0, calls_emails: 0, signups: 11, paying: 3, commission_cents: 1665 }],
    admin_recent_clicks: recent.map((r, i) => ({ clicked_at: r.clicked_at, vendor_id: i % 2 ? 'jordanleef' : 'storyline', link: r.link, user_email: r.visitor_id === 'guest' ? null : 'couple' + i + '@example.com', is_bot: false })),
    partner_statements: [
      { period_start: '2026-07-01', period_end: '2026-09-30', earned_cents: 2395, paid: true, paid_at: '2026-10-14', reference: 'BANK-2231' },
      { period_start: '2026-10-01', period_end: '2026-12-31', earned_cents: 1380, paid: false, paid_at: null, reference: null }],
    partner_statement_lines: a => (a && a.p_period === '2026-07-01'
      ? [{ occurred_at: '2026-07-19T02:00:00Z', anon_id: '12dd9a47', kind: 'payment', paid_cents: 1299, commission_cents: 260 }, { occurred_at: '2026-08-02T02:00:00Z', anon_id: 'c09e5512', kind: 'payment', paid_cents: 3118, commission_cents: 624 }, { occurred_at: '2026-08-19T02:00:00Z', anon_id: '12dd9a47', kind: 'payment', paid_cents: 1299, commission_cents: 260 }, { occurred_at: '2026-09-02T02:00:00Z', anon_id: 'a4f19c02', kind: 'payment', paid_cents: 5456, commission_cents: 1091 }, { occurred_at: '2026-09-19T02:00:00Z', anon_id: '12dd9a47', kind: 'payment', paid_cents: 1299, commission_cents: 260 }, { occurred_at: '2026-09-20T02:00:00Z', anon_id: 'c09e5512', kind: 'reversal', paid_cents: -500, commission_cents: -100 }]
      : [{ occurred_at: '2026-10-19T02:00:00Z', anon_id: '12dd9a47', kind: 'payment', paid_cents: 1299, commission_cents: 260 }, { occurred_at: '2026-11-02T02:00:00Z', anon_id: 'a4f19c02', kind: 'payment', paid_cents: 7794, commission_cents: 1559 }, { occurred_at: '2026-11-05T02:00:00Z', anon_id: 'c09e5512', kind: 'reversal', paid_cents: -2000, commission_cents: -439 }]),
    admin_payout_overview: [
      { partner_id: '1', name: 'Storyline Ceremonies', rate: 0.2, unpaid_cents: 1380, in_draft_cents: 0, paid_cents: 2395 },
      { partner_id: '2', name: 'Jordan Leef Photography', rate: null, unpaid_cents: 0, in_draft_cents: 0, paid_cents: 0 }],
    admin_payouts: [
      { id: 'p1', partner_id: '1', name: 'Storyline Ceremonies', period_start: '2026-07-01', period_end: '2026-09-30', total_cents: 2395, status: 'paid', paid_at: '2026-10-14', reference: 'BANK-2231' }],
    affiliate_create_payout: { status: 'created' }, affiliate_mark_payout_paid: { status: 'paid' }, affiliate_void_payout: { status: 'voided' },
    review_profile_change: { ok: true }, submit_profile_change: { ok: true }, accept_terms: { ok: true }
  };
  const T = {
    vendor_profiles: [profile],
    vendor_profile_changes: kind === 'admin' ? [{ id: 'c1', vendor_id: 'storyline', status: 'pending', submitted_at: new Date().toISOString(), proposed: { hours: 'Open daily 9am–5pm', packages: [{ name: 'Classic ceremony', price_type: 'range', price_min: 950, price_max: 1250, unit: 'package', visible: true }, { name: 'Extra MC time', price_type: 'fixed', price_min: 120, unit: 'hour', visible: true }], photos: ['x/1.jpg', 'x/2.jpg'] } }] : [],
    partner_terms: [{ id: 't1', version: '2026-11', title: 'Preferred Vendor & Referral Agreement (sample)', body_md: 'This is sample text for design review.\n\n1. Commission is paid quarterly in arrears.\n2. Links are disclosed as sponsored.\n3. …' }],
    partner_terms_acceptances: []
  };
  return {
    demo: true,
    session: async () => ({ user: { email: kind === 'admin' ? 'admin@unionvault.app' : 'ben@storylineceremonies.com.au' } }),
    upload: async () => 'x', signIn: async () => {}, signOut: async () => { location.search = ''; },
    rpc: async (name, args) => (typeof R[name] === 'function' ? R[name](args) : R[name]),
    select: async (table, opts) => (T[table] || []).filter(r => !opts || !opts.eq || Object.entries(opts.eq).every(([k, v]) => r[k] === v))
  };
};
