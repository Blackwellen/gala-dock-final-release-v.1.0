import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security";
import { untyped } from "@/lib/workspace/db";

/**
 * "Download my data" (release spec §88–90, UK GDPR Arts. 15 and 20): everything the signed-in user can read about themselves,
 * machine-readable JSON, through their own RLS-scoped client (so it can never include another person's private data).
 * Workspace business records are exported by the workspace owner from the workspace, not here.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await rateLimit(`export:${user.id}`, 5, 3600))) return NextResponse.json({ error: "Too many exports. Try again later." }, { status: 429 });
  const db = untyped(supabase as never);
  const q = async (name: string, p: PromiseLike<{ data: unknown; error: unknown }>) => { const r = await p; return [name, r.error ? { error: "unavailable" } : r.data] as const; };
  const sections = await Promise.all([
    q("profile", db.from("profiles").select("full_name,phone,country,language,bio,date_of_birth,home_area,currency,interests,notifications,marketing_opt_in,marketing_opt_in_at,terms_version,terms_accepted_at,avatar_url,identity_verified,last_active_at,created_at,deletion_requested_at").eq("id", user.id).maybeSingle()),
    q("workspace_memberships", db.from("workspace_members").select("workspace_id,role,status,created_at,workspaces(name,kind)").eq("user_id", user.id)),
    q("events_owned", db.from("events").select("id,name,event_type,status,starts_at,ends_at,location,guest_count,budget_total,created_at").eq("owner_id", user.id)),
    q("tickets", db.from("tickets").select("code,status,order_ref,attendee_name,attendee_email,price_paid,created_at,events(name,starts_at)").eq("holder_id", user.id)),
    q("ticket_waitlists", db.from("ticket_waitlist").select("event_id,tier_id,status,created_at").eq("user_id", user.id)),
    q("orders", db.from("checkout_orders").select("order_ref,kind,status,amount,fee,currency,lines,created_at").eq("buyer_id", user.id)),
    q("reviews", db.from("reviews").select("rating,ratings,body,provider_response,created_at").eq("user_id", user.id)),
    q("saved", db.from("saved_items").select("item_key,created_at").eq("user_id", user.id)),
    q("recently_viewed", db.from("recently_viewed").select("item_key,viewed_at").eq("user_id", user.id)),
    q("messages_sent", db.from("conversation_messages").select("conversation_id,body,created_at").eq("sender_id", user.id).order("created_at").limit(5000)),
    q("legacy_messages_sent", db.from("messages").select("body,created_at,thread_id").eq("sender_id", user.id)),
    q("notifications", db.from("notifications").select("kind,title,body,link,read_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(2000)),
    q("designs", db.from("designs").select("id,title,status,created_at,updated_at").eq("owner_id", user.id)),
    q("agent_runs", db.from("agent_runs").select("id,goal,status,summary,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1000)),
    q("tasks", db.from("user_tasks").select("title,complete,created_at").eq("user_id", user.id)),
    q("privacy_requests", db.from("privacy_requests").select("reference,kind,status,received_at,due_at,completed_at,outcome").eq("user_id", user.id)),
    // Q60: personal records that were missing from the download (all readable by the subject under RLS; secrets and hashes excluded).
    q("following", db.from("follows").select("subject_kind,subject_key,alerts,created_at").eq("user_id", user.id)),
    q("enquiries", db.from("enquiries").select("listing_key,event_date,details,status,created_at").eq("user_id", user.id)),
    q("merch_orders", db.from("merch_orders").select("order_ref,status,total_minor,refunded_minor,currency,created_at,paid_at,collected_at").eq("buyer_id", user.id)),
    q("support_cases", db.from("support_cases").select("reference,subject,category,status,outcome,created_at,resolved_at").eq("requester_id", user.id)),
    q("form_responses", db.from("form_responses").select("form_id,event_id,answers,status,created_at").eq("user_id", user.id)),
    q("waivers_signed", db.from("waiver_signatures").select("event_id,signer_name,signer_email,is_minor,guardian_name,signed_at,status").eq("user_id", user.id)),
    q("private_uploads", db.from("verified_private_uploads").select("path,mime,size_bytes,verified_at").eq("owner_id", user.id)),
    // Q59: trust & verification records about or submitted by you (metadata; the files themselves stay in private storage).
    q("trust_documents_submitted", db.from("provider_documents").select("workspace_id,credential_key,file_name,issuing_organisation,reference,effective_from,expires_on,cover_amount_minor,cover_currency,status,rejection_reason,created_at,reviewed_at").eq("uploaded_by", user.id)),
    q("verification_checks", db.from("verification_checks").select("workspace_id,kind,status,legal_name,trading_name,company_number,source,reason,submitted_at,decided_at,expires_at").or(`submitted_by.eq.${user.id},user_id.eq.${user.id}`)),
    q("trust_actions_about_you", db.from("enforcement_actions").select("reference,action,reason_code,note,status,starts_at,ends_at,appeal_deadline,created_at").eq("subject_type", "user").eq("subject_id", user.id)),
    q("sign_ins", db.rpc("my_sessions")),
    // Q32: records organisers hold about you (guest lists, care needs, registrations, passes, admissions, transfers), resale,
    // waiting rooms, account holds and security events: tables your own RLS-scoped client can't read.
    q("privacy_subject_records", db.rpc("privacy_subject_export")),
    q("consents", db.rpc("my_consents")),
  ]);
  const out = { exported_at: new Date().toISOString(), controller: "Blackwellen Ltd (Gala Dock)", account: { id: user.id, email: user.email, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at },
    ...Object.fromEntries(sections) };
  return new NextResponse(JSON.stringify(out, null, 2), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="gala-dock-data-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "private, no-store" } });
}
