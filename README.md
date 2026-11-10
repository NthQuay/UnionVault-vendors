# UnionVault Vendors

The vendor portal for [Union Vault](https://unionvault.app), served at **https://vendors.unionvault.app**
(GitHub Pages, custom domain via `CNAME`).

Vendors sign in to edit their listing, see clicks from Union Vault and sign-ups from their referral link, and accept
the vendor terms. Union Vault staff use the same site (admin role) to review profile edits and see all vendors.

- No build step: plain HTML, CSS and JavaScript, like the main app.
- Data lives in the **same Supabase project** as the app.
- **Everything portal-specific lives here:** the pages (`index.html`, `css/`, `js/`) and the portal's database
  changes in `supabase/migrations/` (`20261112_vendor_portal.sql`, `20261113_vendor_portal_listing.sql`: listings, photos
  storage bucket, packages & pricing, review queue, terms, portal functions).
- Still in the main repo (`NthQuay/UnionVault`) because the app itself uses them: the click tracker edge function
  `vendor-click`, `20261111_vendor_clicks.sql`, and the shared affiliate tables in `20261110_affiliate_schema.sql`.
  Apply order: 20261110 (main) → 20261111 (main) → 20261112 → 20261113 (this repo).
- `?demo=vendor` / `?demo=admin` shows the portal with sample data (design review only; remove before go-live).
- Only the Supabase *publishable* key is used in the browser; all access is limited by row-level security.

© 2026 NthQuay Pty Ltd. All rights reserved.
