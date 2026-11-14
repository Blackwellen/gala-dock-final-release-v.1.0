# Gala Dock Cookie Policy (v3 draft, gd-cp-3.0)

> **DRAFT v3: not in force, not published.** Q54 legal review, 2026-11-14 (AI review, not legal advice). Replaces `/cookies` (2026-10). **Changes:** adds Cloudflare Turnstile, embedded video and Google Fonts; keeps the consent-gated referral cookies. Engineering to confirm the exact Turnstile storage and whether video embeds use privacy-enhanced mode or a consent gate before publication.

Cookies are small files your browser stores for a website. We use a small number of our own cookies and similar storage to run Gala Dock. We don't use advertising or cross-site tracking cookies. Under PECR, storage that is strictly necessary for a service you ask for doesn't need consent; everything else is off until you choose it.

## Our cookies and storage
| Name | Type | Purpose | Lasts |
|---|---|---|---|
| `sb-…-auth-token` | Strictly necessary | Keeps you signed in securely | Session, or up to 400 days if you choose "Remember this device" |
| `gd-remember` | Strictly necessary | Records whether to keep you signed in on this device | 400 days |
| `gd_co_…` | Strictly necessary | Links your checkout to the tickets or seats held for you | Until checkout ends |
| `gd_consent` | Strictly necessary | Remembers your cookie and analytics choices | 12 months |
| `gd_cc` | Strictly necessary | Records only that you made a cookie choice | 12 months |
| `gd_ref` | Referral (only with consent) | Credits the promoter whose link you followed if you buy a ticket for that event; set only if you choose "Continue and credit the promoter" | 30 days |
| `gd_partner` | Partner referral (only with consent) | Credits the partner whose link you followed if you create a workspace and subscribe; set only if you choose "Continue and credit the partner" | 30 days |
| `gd-density` (local storage) | Preference | Workspace display density | Until cleared |
| `gd-cal-views` (local storage) | Preference | Saved calendar views | Until cleared |
| `gd_scan_device` (local storage) | Strictly necessary (staff only) | Identifies a scanning device so offline check-ins reconcile | Until cleared |

## Third-party services
| Service | When | What it does |
|---|---|---|
| Stripe | Checkout and payout set-up | Sets its own cookies to process payments and prevent fraud (strictly necessary); see Stripe's cookie policy |
| Cloudflare Turnstile | Sign-in, sign-up and some forms | Checks you're not a bot; may read or store device data for that check (strictly necessary for security) [engineering: confirm storage] |
| Google Fonts | Page load | Your browser fetches font files from Google, which receives your IP address; no cookies [or self-host fonts and delete this row] |
| Maps | Pages with maps | Tiles come through our servers from MapTiler; some map content may load from OpenStreetMap |
| Embedded video (YouTube, Vimeo) | Only when you play a video on an event or listing page [or: only after you allow it] | The video host may set its own cookies |

## Analytics
Analytics is off until you choose "Allow analytics" in the cookie banner. It doesn't set its own cookie. You can change your choice at any time from the **Cookie settings** button.

## Managing cookies
You can block or delete cookies in your browser. If you block strictly necessary cookies, you won't be able to sign in or check out. See the Privacy Policy for how we use personal data.
