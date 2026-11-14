"use server";

import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";

/** Opens a support case for the signed-in partner (partner_contact_support validates partnership + rate limit). */
export async function contactSupport(subject: string, body: string): Promise<{ ok: true; reference: string } | { ok: false; error: string }> {
  if (typeof subject !== "string" || typeof body !== "string") return { ok: false, error: "Invalid request." };
  const s = subject.trim(), b = body.trim();
  if (s.length < 3 || s.length > 200 || b.length < 10 || b.length > 5000) return { ok: false, error: "Add a subject and at least a sentence describing the issue." };
  const sb = untyped(await createClient());
  const { data, error } = await sb.rpc("partner_contact_support", { p_subject: s, p_body: b });
  if (error) return { ok: false, error: error.message.includes("rate_limited") ? "You’ve sent several requests recently — please wait a little before sending another." : error.message.includes("not_allowed") ? "Only partner accounts can contact partner support here." : "Couldn’t send — please try again." };
  return { ok: true, reference: String(data) };
}

const APPLY_ERRORS: [RegExp, string][] = [
  [/already_partner/, "You’re already a Gala Dock partner — open the partner portal."],
  [/already_applied/, "Your application is already with the partnerships team."],
  [/email_unverified/, "Verify your email address first, then apply."],
  [/terms_changed/, "The partner terms were updated. Reload the page and accept the current version."],
  [/self_billing_required/, "Please agree to self-billed statements to join the programme."],
  [/invalid_vat_number/, "Enter your VAT number with its country prefix, e.g. GB123456789."],
  [/rate_limited/, "Too many applications today. Please try again tomorrow."],
];

/** Q68: self-serve partner application (partner_apply records the versioned terms + self-billing consent). */
export async function applyToPartnerProgramme(data: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = (k: string) => String(data.get(k) ?? "").trim();
  const types = ["individual", "sole_trader", "company", "charity", "other"];
  if (s("contact_name").length < 2 || s("business_name").length < 2 || !types.includes(s("business_type")) || !/^[A-Z]{2}$/.test(s("country")))
    return { ok: false, error: "Fill in your name, business name, type and country." };
  if (s("website") && !/^https?:\/\/\S+$/i.test(s("website"))) return { ok: false, error: "Enter the website as a full address starting with https://" };
  if (data.get("accept_terms") !== "on") return { ok: false, error: "Please accept the partner terms." };
  const sb = untyped(await createClient());
  const { error } = await sb.rpc("partner_apply", {
    p_contact_name: s("contact_name").slice(0, 120), p_business_name: s("business_name").slice(0, 160), p_business_type: s("business_type"), p_country: s("country"),
    p_website: s("website") || null, p_audience: s("audience").slice(0, 1000), p_vat_registered: data.get("vat_registered") === "on", p_vat_number: s("vat_number") || null,
    p_terms_version: s("terms_version"), p_self_billing: data.get("accept_self_billing") === "on",
  });
  if (error) return { ok: false, error: APPLY_ERRORS.find(([re]) => re.test(error.message))?.[1] ?? "Couldn’t send your application — please try again." };
  return { ok: true };
}

/** Q68: the partner's VAT status for self-billed statements (VAT on top for UK VAT-registered partners). */
export async function saveTaxDetails(data: FormData): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const registered = data.get("vat_registered") === "on";
  const sb = untyped(await createClient());
  const { error } = await sb.rpc("partner_set_tax_details", { p_vat_registered: registered, p_vat_number: registered ? String(data.get("vat_number") ?? "") : null });
  if (error) return { ok: false, error: /invalid_vat_number/.test(error.message) ? "Enter your VAT number with its country prefix, e.g. GB123456789." : /step_up/.test(error.message) ? "Verify your second factor, then try again." : "Couldn’t save — please try again." };
  return { ok: true, message: "Tax details saved. They apply to statements paid from now on." };
}
