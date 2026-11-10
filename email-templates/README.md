# Vendor sign-in email

`magic-link.html` is the branded sign-in email vendors receive (logo, "Vendors" badge, gold button, dark-mode aware).

Supabase sends it, so it has to be pasted in once (it is **not** deployed with the site):

1. Supabase dashboard → project `hzafdlfprtzfxtyaebmc` → **Authentication → Email Templates → Magic Link**.
2. **Subject:** `Your Union Vault Vendors sign-in link`
3. **Message body:** paste the whole of `magic-link.html` and save.

Only the vendor portal uses the Magic Link template (the main app signs in with a password), so this does not change
any email couples receive. The template uses Supabase's variables: `{{ .ConfirmationURL }}` and `{{ .Email }}`.
The logo files are served from https://unionvault.app/assets/.
