# Sign-in setup: passkeys, bot protection, Google

All three are applied by one script that dry-runs by default:

```bash
node --env-file=.env --env-file=.env.local scripts/auth-config.mjs          # preview
node --env-file=.env --env-file=.env.local scripts/auth-config.mjs --apply  # apply
```

## Passkeys: done

Enabled on 12 Oct 2026:
- Relying party `galadock.com`
- Origins `https://galadock.com` and `https://www.galadock.com`
- Factor-change email notifications are on

How people use them:
- **Add a passkey:** Account → Privacy & Security → **Add a passkey**.
- **Sign in:** use **Sign in with a passkey** on the login page.

Passkeys only work on the production domains. On localhost the browser refuses them, because the relying party is `galadock.com`.

## Bot protection (Cloudflare Turnstile): done

Set up on 12 Oct 2026 through the Cloudflare API, with the widget "Gala Dock" in managed mode for galadock.com, www.galadock.com, the Vercel production domain and localhost. The domain stays at IONOS, because Turnstile doesn't need Cloudflare DNS. The site key is in Vercel and `.env`, and the secret key is in `.env` and Supabase Auth.

To set it up again by hand:

1. Open Cloudflare dashboard → **Turnstile** → **Add widget**:
   - Name: Gala Dock
   - Hostnames: `galadock.com`, `www.galadock.com`
   - Mode: **Managed**
2. Copy the **Site key** and the **Secret key**.
3. In Vercel (Production), set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to the site key, then redeploy.
4. Locally, add `TURNSTILE_SECRET_KEY=<secret>` to `.env`, then run `scripts/auth-config.mjs --apply`. This turns on Supabase Auth "Bot protection" with Turnstile.
5. Check it: the login, sign-up and forgot-password forms now show the (usually invisible) check. Supabase rejects sign-ins without a valid token.

**Order matters.** Deploy the site key **before** applying the secret. If you don't, Supabase will start requiring tokens that the live forms aren't sending yet.

## Google sign-in: about 10 minutes

1. Google Cloud Console → **APIs & Services → OAuth consent screen**:
   - User type: External
   - App name: Gala Dock
   - Support email: support@galadock.com
   - Authorised domain: `galadock.com`
   - Scopes: `email`, `profile`, `openid`
   - Publish the app.
2. **Credentials → Create credentials → OAuth client ID** (type **Web application**):
   - **Authorised JavaScript origins:** `https://www.galadock.com`
   - **Authorised redirect URI:** `https://<your-project-ref>.supabase.co/auth/v1/callback` (Supabase handles the callback, then redirects to `/auth/callback`)
3. Add `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` to `.env`, then run `scripts/auth-config.mjs --apply`.
4. The **Continue with Google** button appears on the login and sign-up screens automatically: the app reads which providers are enabled from Supabase.
5. Optionally, add `GOOGLE_OAUTH_CLIENT_ID` to Vercel too, so `/api/health` reports Google sign-in as configured.
