import "server-only";
import { Suspense } from "react";
import { preloadSatoshi } from "@/lib/fonts";
import { redirect } from "next/navigation";
import { AuthPage, type AuthProps } from "./auth";
import { createClient } from "@/lib/supabase/server";
import { describeIntent, safeNext } from "@/lib/redirects";
import { hashToken, isTokenFormat } from "@/lib/security";
import { publicRoutes, type AuthScreen } from "@/lib/routes";
import { previewAuthProps } from "@/lib/preview-data";

type Search = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;
const titles = Object.fromEntries(publicRoutes.map(r => [r.path, r.title]));
const errorCodes: Record<string, string> = {
  link_expired: "Your sign-in link has expired. Please try again.",
  oauth_failed: "We couldn’t complete sign-in with that provider. Please try again.",
};
export const accessReasons = ["denied", "suspended", "revoked", "expired", "insufficient"] as const;

/** Identity providers actually enabled in Supabase Auth; only these get buttons. */
async function enabledProviders() {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! }, next: { revalidate: 300 },
    });
    const settings = await response.json() as { external?: Record<string, boolean> };
    return (["google", "azure"] as const).filter(p => settings.external?.[p]);
  } catch {
    return [];
  }
}

const daysUntil = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));

export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return "";
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, name.length - 2)))}@${domain}`;
}

export async function AuthRoute({ screen, searchParams, token, preview = false }: { screen: AuthScreen; searchParams: Promise<Search>; token?: string; preview?: boolean }) {
  preloadSatoshi();
  const search = await searchParams;
  if (preview) return <Suspense><AuthPage {...previewAuthProps(screen, search)} /></Suspense>;
  const next = safeNext(one(search.next), "");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const props: AuthProps = {
    screen, next, intent: describeIntent(next, titles), providers: [], error: errorCodes[one(search.error) ?? ""] ?? "",
    signedInEmail: user?.email ?? null,
  };

  if (screen === "login" || screen === "register") {
    if (user?.email_confirmed_at) redirect(`/continue${next ? `?next=${encodeURIComponent(next)}` : ""}`);
    props.providers = await enabledProviders();
    props.email = one(search.email)?.slice(0, 254) ?? "";
  }
  if (screen === "verify-email") {
    const email = one(search.email) ?? user?.email ?? "";
    props.maskedEmail = email ? maskEmail(email) : "";
    props.email = email;
    props.state = one(search.state) === "expired" ? "expired" : user?.email_confirmed_at ? "verified" : "waiting";
  }
  if (screen === "reset-password") props.state = one(search.state) === "expired" || !user ? "expired" : "valid";
  if (screen === "mfa") {
    if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
    const [{ data: factors }, { data: aal }] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
    if (aal?.currentLevel === "aal2") redirect(`/continue${next ? `?next=${encodeURIComponent(next)}` : ""}`);
    props.factors = (factors?.totp ?? []).filter(f => f.status === "verified").map(f => ({ id: f.id, name: f.friendly_name ?? "Authenticator app" }));
    props.state = one(search.required) === "1" ? "required" : "challenge";
  }
  if (screen === "invite") {
    let invite = null;
    if (token && isTokenFormat(token)) {
      const { data } = await supabase.rpc("invite_preview", { p_token_hash: hashToken(token) });
      const row = data?.[0];
      invite = row ? { ...row, days_remaining: daysUntil(row.expires_at) } : null;
    }
    props.token = token ?? "";
    props.invite = invite;
    props.state = invite?.state ?? "unavailable";
    props.next = `/invite/${token ?? ""}`;
  }
  if (screen === "access") {
    const reason = one(search.reason);
    props.state = accessReasons.includes(reason as typeof accessReasons[number]) ? reason! : "denied";
    if (!user) props.state = "expired";
    else {
      const { data } = await supabase.rpc("my_workspace_access");
      props.workspaces = (data ?? []).filter(w => w.member_status === "active" && w.workspace_status === "active" && w.onboarding_complete)
        .map(w => ({ id: w.id, name: w.name, kind: w.kind }));
    }
  }
  return <Suspense><AuthPage {...props} /></Suspense>;
}
