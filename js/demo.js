// Sample data for design review only: open the site with ?demo=vendor or ?demo=admin. No network, no real data.
window.PORTAL_DEMO = function (kind) {
  const days = []; const base = new Date(); base.setHours(0, 0, 0, 0);
  const sample = [2,3,1,4,6,3,5,7,4,6,8,5,9,7,6,10,8,12,9,11,14,10,13,12,15,11,14,17,13,16];
  sample.forEach((n, i) => {
    const d = new Date(base); d.setDate(d.getDate() - (29 - i)); const iso = d.toISOString().slice(0, 10);
    days.push({ day: iso, link: 'website', clicks: Math.round(n * 0.55) }, { day: iso, link: 'contact', clicks: Math.round(n * 0.2) }, { day: iso, link: 'call', clicks: Math.round(n * 0.15) }, { day: iso, link: 'email', clicks: Math.round(n * 0.1) });
  });
  const now = Date.now();
  const recent = ['website','contact','call','website','email','website','instagram','website'].map((l, i) => ({ clicked_at: new Date(now - i * 5400000).toISOString(), link: l, visitor_id: i % 3 === 0 ? 'guest' : ['a4f19c02','7be3d81a','c09e5512','12dd9a47'][i % 4] }));
  const profile = { vendor_id: 'storyline', name: 'Storyline Ceremonies', category: 'Celebrants', category_label: 'Marriage Celebrant & MC', area: 'Ceremony at a location of your choice. $2 per km outside a 40km radius of Brisbane’s CBD.', hours: 'Open daily 9:30am–4:30pm', phone: '0475 296 057', email: 'ben@storylineceremonies.com.au', published: true };
  const R = {
    is_admin: kind === 'admin',
    my_vendor_id: 'storyline',
    partner_summary: kind === 'admin' ? null : { name: 'Storyline Ceremonies', code: 'storyline', rate: 0.25, signups: 19, active_subscribers: 7, earned_cents: 3840, unpaid_cents: 3840, paid_cents: 0 },
    partner_referrals: [{ anon_id: 'a4f19c02', signed_up_at: '2026-11-02', subscription_status: 'active' }, { anon_id: '7be3d81a', signed_up_at: '2026-10-30', subscription_status: 'trialing' }, { anon_id: 'c09e5512', signed_up_at: '2026-10-24', subscription_status: 'active' }, { anon_id: '12dd9a47', signed_up_at: '2026-10-19', subscription_status: 'none' }],
    vendor_click_summary: days, vendor_recent_clicks: recent,
    admin_partner_overview: [{ partner_id: '1', name: 'Storyline Ceremonies', vendor_id: 'storyline', clicks: 214, contact_form: 41, calls_emails: 55, signups: 19, paying: 7, commission_cents: 3840 }, { partner_id: '2', name: 'Jordan Leef Photography', vendor_id: 'jordanleef', clicks: 171, contact_form: 0, calls_emails: 0, signups: 11, paying: 3, commission_cents: 1665 }],
    admin_recent_clicks: recent.map((r, i) => ({ clicked_at: r.clicked_at, vendor_id: i % 2 ? 'jordanleef' : 'storyline', link: r.link, user_email: r.visitor_id === 'guest' ? null : 'couple' + i + '@example.com', is_bot: false })),
    review_profile_change: { ok: true }, submit_profile_change: { ok: true }, accept_terms: { ok: true }
  };
  const T = {
    vendor_profiles: [profile],
    vendor_profile_changes: kind === 'admin' ? [{ id: 'c1', vendor_id: 'storyline', status: 'pending', submitted_at: new Date().toISOString(), proposed: { hours: 'Open daily 9am–5pm', phone: '0475 296 057' } }] : [],
    partner_terms: [{ id: 't1', version: '2026-11', title: 'Partner terms (sample)', body_md: 'This is sample text for design review.\n\n1. Commission is paid quarterly in arrears.\n2. Links are disclosed as sponsored.\n3. …' }],
    partner_terms_acceptances: []
  };
  return {
    demo: true,
    session: async () => ({ user: { email: kind === 'admin' ? 'admin@unionvault.app' : 'ben@storylineceremonies.com.au' } }),
    signIn: async () => {}, signOut: async () => { location.search = ''; },
    rpc: async (name) => R[name],
    select: async (table, opts) => (T[table] || []).filter(r => !opts || !opts.eq || Object.entries(opts.eq).every(([k, v]) => r[k] === v))
  };
};
