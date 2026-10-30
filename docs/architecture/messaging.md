# Messaging & notifications (Q05)

## Canonical model

`conversations` + `conversation_participants` (user or workspace seats) + `conversation_messages`. Legacy marketplace `threads`/`messages` (build-item threads) stay readable; `message_thread_links` maps a legacy thread to its canonical conversation (backfilled by build item; created on the first context message). Views `inbox_threads` / `inbox_messages` (security_invoker → caller's RLS) present one model: linked legacy messages appear under the conversation id; every message appears once.

## Context threads — `send_context_message(context, id, body, attachments, as_workspace, to_workspace, client_msg_id, subject)`

- Contexts: `booking` / `quote` (build item), `event` (needs counterpart workspace), `listing` (enquiry to a published listing).
- One thread per context + pair of parties: transaction advisory lock on (context key, parties); `conversations.context_key` = `build_item:<id>`, `event:<id>`, `listing:<id>`.
- Idempotent: `client_msg_id` unique per conversation → a retry returns the original message (`duplicate: true`).
- Authorisation: event access, or membership of the provider workspace on the build item; attachments must be the sender's own verified uploads (Q04 gate on download).
- API: `POST /api/messages/context`, `GET /api/inbox`, `GET /api/inbox?thread=<id>`. The deployed `start_conversation` / `post_message` are unchanged.

## Notifications

- `notification_categories`: transactional (security, payments: mandatory; tickets, quotes, messages, reminders, event_updates) vs marketing (newsletter, product_updates).
- `notify(user, kind, title, body, link, dedupe_key)` (service): one row per dedupe key; refuses marketing kinds. App job `notifications.send` wraps it for domain-event fan-out.
- Email: `trg_notification_email` → `email_outbox` (per-category preferences in `profiles.notifications`; security/payments always) → `/api/cron/email` → Resend (Idempotency-Key = outbox id).
- Never sent: reserved test domains (`*.test`, `*.example`, `*.invalid`, localhost, example.com/org/net and their subdomains) and `email_suppressions`. Note: 9 emails went to `gala-dock.test` on 2026-10-11, before this guard existed; none since.

## Delivery events

`POST /api/webhooks/resend` (Svix signature, 5-minute tolerance, needs `RESEND_WEBHOOK_SECRET`) → `email_record_event` (idempotent per svix-id). Hard bounce / complaint → `email_suppressions` + queued mail to that address suppressed; soft bounces recorded only.

## Marketing consent (PECR) and contact

- `POST /api/subscriptions` {email, topic, consent:true} → pending `marketing_subscriptions` row (consent version, hashed IP) + one confirmation email. GET on the confirm link only shows a button (scanners cannot confirm); POST confirms or unsubscribes.
- `POST /api/contact` (signed out OK): validation, honeypot, rate limit per hashed IP/email, Turnstile when `CONTACT_TURNSTILE=on` → `contact_submissions` + in-app notice to support admins.

## Mailbox contracts (env names; health → `contracts.mailbox`)

Gmail sync (`GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN`), IMAP sync (`IMAP_HOST/PORT/USER/PASSWORD`), SMTP send (`SMTP_HOST/PORT/USER/PASSWORD`). Status configured/partial/not_configured from `mailboxStatus()`. Sync/send transports are not implemented (BLOCKED_EXTERNAL).
