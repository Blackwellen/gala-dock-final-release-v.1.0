# User / Manual Actions Required — Calendar Hub

## Section
Event Manager → Calendar Hub  
Route: `/event-manager/calendar`

---

## 1. Remove Dev Bypasses Before Production Deploy

Two temporary dev-only bypasses were added during QA. **Remove or verify these are inert in production:**

### `src/proxy.ts` — dev bypass
```typescript
// REMOVE THIS BLOCK before production deploy (or confirm NODE_ENV=production removes it)
const isDevBypass =
  process.env.NODE_ENV === "development" &&
  pathname.startsWith("/event-manager/calendar");

if (!user && !isPublic && !isDevBypass) {
```
**Action:** Confirm that your Vercel/production build sets `NODE_ENV=production` (it does by default). The bypass only fires when `NODE_ENV === "development"` so it is inert in production, but you should still confirm this in your first production smoke test.

### `src/app/event-manager/calendar/page.tsx` — dev flag bypass
```typescript
const isDev = process.env.NODE_ENV === "development";
if (!isDev && !flags.calendarHub) {
```
**Action:** Same — `isDev` is `false` in production, so the feature flag gate is always active in production. Confirm in smoke test.

---

## 2. Set `calendarHub` Flag to `true` for Pro Workspaces

The `calendarHub` flag is gated on `plan: "pro"` and `workspaceType: "organizer"`. Before releasing to customers:

1. Log in to **Platform Admin**
2. Navigate to **Feature Flags**
3. Confirm `calendarHub` is enabled for the `pro` plan tier
4. Confirm `calendarHub` is disabled for `free` and `starter` plans

---

## 3. Create Real Login Credentials / Supabase Auth User

During QA, the login credentials `jamahlthomas1996@gmail.com` / `Jamaica1996!` returned "Invalid login credentials". The actual Supabase auth user may not exist or has a different password.

**Action:**
1. Log in to your Supabase project dashboard at `https://supabase.com/dashboard`
2. Navigate to **Authentication → Users**
3. Either create a new user with email `jamahlthomas1996@gmail.com` or reset the password
4. Create a corresponding workspace + workspace_member record if not already present
5. Set `active_workspace_id` on the profile, or ensure the workspace_members fallback resolves

---

## 4. Wire `calendar_range` RPC for Real Event Data

The calendar currently falls back to demo data when no workspace is authenticated. To get live data flowing:

1. Confirm the `calendar_range` Supabase RPC exists in your project:
   ```sql
   SELECT routine_name FROM information_schema.routines 
   WHERE routine_name = 'calendar_range';
   ```
2. If missing, apply the migration from `supabase/migrations/` that creates it
3. Once authenticated (step 3 above), the calendar will show real workspace events

---

## 5. Configure R2 for Production Calendar Images

Event image thumbnails currently use Unsplash CDN placeholder URLs. For production:

1. Set up Cloudflare R2 bucket (already configured in `next.config.ts` `remotePatterns`)
2. Add `CLOUDFLARE_R2_PUBLIC_URL` to environment variables
3. Replace Unsplash URLs in `demo-data.ts` `IMGS` constants with your R2 bucket URLs when seeding production data
4. Wire the R2 upload flow to event create/edit wizards for image attachments

---

## 6. Confirm `next.config.ts` Image Domains in Production

`remotePatterns` were added for Unsplash and R2 during QA. Confirm these are correct for production:

```typescript
images: {
  remotePatterns: [
    { protocol: "https", hostname: "images.unsplash.com" },     // dev/demo only
    { protocol: "https", hostname: "*.unsplash.com" },          // dev/demo only
    { protocol: "https", hostname: "pub-*.r2.dev" },            // your R2 public bucket
    { protocol: "https", hostname: "*.cloudflare.com" },        // R2 custom domain
    { protocol: "https", hostname: "*.supabase.co" },           // Supabase storage
  ],
},
```

Remove the Unsplash entries if no Unsplash images will be used in production.

---

## 7. Production Smoke Test Checklist

After deploying to staging/production, manually verify:

- [ ] `/event-manager/calendar` redirects unauthenticated users to `/login`
- [ ] After login, calendar loads with real workspace data (not demo data)
- [ ] Feature flag gate: free plan user sees upgrade screen with "View plans" link
- [ ] Pro plan user sees full calendar
- [ ] Month view: period navigation updates URL and re-renders
- [ ] Week view: all-day banner row shows multi-day events
- [ ] Day view: 5 lanes all show correctly
- [ ] Agenda view: grouped rows with correct status badges
- [ ] Mobile (375px): month banner spans full width, right panel hidden
- [ ] No console errors in any view

---

## 8. Optional: SQL Demo Seed for Development

If you want persistent demo data in your Supabase dev database (rather than the static `demo-data.ts` fixtures), create a seed SQL file with the events from `demo-data.ts`. Key tables to seed:

- `events` (the Pulse Summit, Theatre Gala, After Dark, etc.)
- `tasks` (compliance check, menu finalisation, etc.)
- `venue_bookings` (Riverside Convention Center, Grand Opera House, etc.)
- `supplier_bookings` (catering, AV, photography)
- `run_sheets` linked to events

This is optional for V1 — the static demo data in `demo-data.ts` is sufficient for the initial release.
