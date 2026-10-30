// W09 / Q16: an UNSIGNED contract with a client share link on the DEMO organiser (Alex Events, not a fresh workspace), for
// Neon Nights' client Jordan Reid: contract_create (with the client as signer) → contract_send, which issues the hashed share
// token the external /contract/[token] page resolves. The raw token is never printed (the portal flow emails it; reserved
// domain → suppressed). Neon Nights invoices for the portal client already exist (INV-2026-001…004); demo guest links are
// seeded by guests.mjs. Neon's promo video_url needs an owner-supplied URL (no third-party content is invented) — reported.
import { block } from "./lib.mjs";

const ORG = "alex.events@example.com";

export async function run() {
  return block(`
  perform pg_temp._as('${ORG}');
  v := (select id from public.workspaces where name = 'Alex Events' and owner_id = pg_temp._uid('${ORG}'));
  v2 := (select id from public.clients where workspace_id = v and (lower(email) = 'jordan.reid@example.com' or name = 'Jordan Reid') limit 1);
  if v2 is null then
    insert into public.clients(workspace_id, name, email) values (v, 'Jordan Reid', 'jordan.reid@example.com') returning id into v2;
    perform pg_temp._n('clients');
  end if;
  if not exists (select 1 from public.contracts where workspace_id = v and title = 'Neon Nights 2026 — production services agreement') then
    perform public.contract_create(v, jsonb_build_object('title', 'Neon Nights 2026 — production services agreement', 'client_id', v2, 'event_id', pg_temp._ev('neon-nights'),
      'currency', 'GBP', 'value', 38200, 'expires_at', now() + interval '21 days', 'term_ends_at', now() + interval '120 days',
      'body', 'This agreement covers production management, staging, sound and lighting for Neon Nights Festival 2026 at Riverside Park, London. '
           || 'Fee £38,200 + VAT: 50% on signature, 50% fourteen days before the event. Cancellation: deposit non-refundable inside 60 days. '
           || 'The client provides the premises licence and site access; Alex Events provides the event safety plan and insured crew.',
      'parties', jsonb_build_array(jsonb_build_object('role', 'client', 'name', 'Jordan Reid', 'email', 'jordan.reid@example.com', 'signer', true))));
    perform pg_temp._n('contracts');
    v2 := (select id from public.contracts where workspace_id = v and title = 'Neon Nights 2026 — production services agreement' order by created_at desc limit 1);
    perform public.contract_send(v2);
    perform pg_temp._n('contracts_sent');
  end if;
  `);
}
