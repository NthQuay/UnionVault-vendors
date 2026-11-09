# UnionVault Vendors

The vendor / partner portal for [Union Vault](https://unionvault.app), served at **https://vendors.unionvault.app**
(GitHub Pages, custom domain via `CNAME`).

Vendors sign in to edit their listing, see clicks from Union Vault and sign-ups from their referral link, and accept
the partner terms. Union Vault staff use the same site (admin role) to review profile edits and see all partners.

- No build step: plain HTML, CSS and JavaScript, like the main app.
- Data lives in the **same Supabase project** as the app. The database migrations live in the main repo
  (`NthQuay/UnionVault`, `supabase/migrations/`). This repo only holds the pages.
- Only the Supabase *publishable* key is used in the browser; all access is limited by row-level security.

© 2026 NthQuay Pty Ltd. All rights reserved.
