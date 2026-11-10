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
    partner_summary: kind === 'admin' ? null : { name: 'Storyline Ceremonies', code: 'storyline', rate: 0.25, signups: 19, active_subscribers: 7, earned_cents: 3840, unpaid_cents: 3840, paid_cents: 0 },
    partner_referrals: [{ anon_id: 'a4f19c02', signed_up_at: '2026-11-02', subscription_status: 'active' }, { anon_id: '7be3d81a', signed_up_at: '2026-10-30', subscription_status: 'trialing' }, { anon_id: 'c09e5512', signed_up_at: '2026-10-24', subscription_status: 'active' }, { anon_id: '12dd9a47', signed_up_at: '2026-10-19', subscription_status: 'none' }],
    vendor_clicks_all: days, vendor_recent_clicks: recent,
    admin_partner_overview: [{ partner_id: '1', name: 'Storyline Ceremonies', vendor_id: 'storyline', clicks: 214, contact_form: 41, calls_emails: 55, signups: 19, paying: 7, commission_cents: 3840 }, { partner_id: '2', name: 'Jordan Leef Photography', vendor_id: 'jordanleef', clicks: 171, contact_form: 0, calls_emails: 0, signups: 11, paying: 3, commission_cents: 1665 }],
    admin_recent_clicks: recent.map((r, i) => ({ clicked_at: r.clicked_at, vendor_id: i % 2 ? 'jordanleef' : 'storyline', link: r.link, user_email: r.visitor_id === 'guest' ? null : 'couple' + i + '@example.com', is_bot: false })),
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
    rpc: async (name) => R[name],
    select: async (table, opts) => (T[table] || []).filter(r => !opts || !opts.eq || Object.entries(opts.eq).every(([k, v]) => r[k] === v))
  };
};
