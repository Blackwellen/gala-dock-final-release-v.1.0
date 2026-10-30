import "server-only";
import { VIRTUAL_PROVIDERS, type VirtualEventProvider } from "./providers";

/**
 * Virtual provider adapter boundary (domain 182, Q29). Gala Dock never hosts real-time media: a provider supplies meetings, links,
 * attendance and recordings; Gala Dock stores them (virtual_sessions / virtual_recordings) and gates access by entitlement
 * (virtual_issue_join_token → virtual_redeem_join_token). Only jobs / server actions call adapters — never React components.
 *
 * Status today: BLOCKED_EXTERNAL for every API provider (no credentials, no sandbox). `manual` (the organiser pastes the provider's
 * links) is fully supported. No provider API is called anywhere until an adapter below is implemented and its env is set.
 *
 * Env contract (names only; values are never returned or logged):
 *   zoom          ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_WEBHOOK_SECRET (attendance / recording webhooks)
 *   teams         MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT_ID
 *   google_meet   GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET
 *   youtube_live  YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET
 *   vimeo         VIMEO_ACCESS_TOKEN
 */
export type CreatedMeeting = { externalMeetingId: string; joinUrl: string; speakerUrl?: string; hostUrl?: string; hostSecretNote?: string };
export type ProviderAttendance = { externalParticipant: string; email?: string; joinedAt: string; leftAt?: string };
export type ProviderRecording = { externalId: string; title: string; url: string; durationSeconds?: number; captions?: boolean };

export interface VirtualProviderAdapter {
  readonly key: string;
  /** Create the provider meeting / stream for a session. Host links come back separately and are stored column-private. */
  createMeeting(input: { title: string; startsAt: string; endsAt: string; timezone: string; capacity?: number | null; captions?: string }): Promise<CreatedMeeting>;
  /** Optional per-attendee link (registrant links) so a shared URL can't be reused by someone else. */
  createAttendeeLink?(input: { externalMeetingId: string; displayName: string; email?: string }): Promise<{ joinUrl: string }>;
  /** Attendance pulled after / during a session → virtual_record_provider_attendance (service role). */
  fetchAttendance?(externalMeetingId: string): Promise<ProviderAttendance[]>;
  /** Cloud recordings → virtual_recording_save (status processing → available after review). */
  fetchRecordings?(externalMeetingId: string): Promise<ProviderRecording[]>;
  cancelMeeting?(externalMeetingId: string): Promise<void>;
}

export type VirtualProviderHealth = { key: string; label: string; state: "manual" | "ok" | "BLOCKED_EXTERNAL"; missing: string[]; adapter: boolean };

const ENV_EXTRA: Record<string, string[]> = { zoom: ["ZOOM_WEBHOOK_SECRET"] };
const envFor = (p: VirtualEventProvider) => [...p.env, ...(ENV_EXTRA[p.key] ?? [])];

/** Validates the env contract without touching the network. No adapter ships yet, so configured providers still report adapter:false. */
export function virtualProviderHealth(env: Record<string, string | undefined> = process.env): VirtualProviderHealth[] {
  return VIRTUAL_PROVIDERS.map(p => {
    if (!p.supportsApi) return { key: p.key, label: p.label, state: "manual" as const, missing: [], adapter: false };
    const missing = envFor(p).filter(k => !env[k]);
    return { key: p.key, label: p.label, state: missing.length ? "BLOCKED_EXTERNAL" as const : "ok" as const, missing, adapter: false };
  });
}

/** Summary for /api/health → contracts.virtual. */
export function virtualHealthSummary(env: Record<string, string | undefined> = process.env) {
  const all = virtualProviderHealth(env).filter(p => p.state !== "manual");
  return { manual_links: "supported", api_providers: all.length, configured: all.filter(p => p.state === "ok").length, state: "BLOCKED_EXTERNAL" as const, adapters: 0 };
}

/** Returns the adapter for a provider, or null (manual links / not configured / not implemented). Never throws, never calls out. */
export function virtualAdapter(key: string, env: Record<string, string | undefined> = process.env): VirtualProviderAdapter | null {
  const h = virtualProviderHealth(env).find(p => p.key === key);
  if (!h || h.state !== "ok") return null;
  return null;   // BLOCKED_EXTERNAL: implement per provider once credentials and a sandbox exist.
}
