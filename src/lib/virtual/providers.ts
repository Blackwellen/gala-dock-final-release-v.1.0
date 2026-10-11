/**
 * VirtualEventProvider abstraction (release spec §124). Gala Dock never hosts real-time media: a provider supplies the session and links,
 * Gala Dock stores them and gates attendee access by ticket. `manual` works today (the organiser pastes the provider's links); API
 * adapters declare their configuration contract and report BLOCKED_EXTERNAL_CONFIGURATION until credentials exist.
 */
export type VirtualFormat = "webinar" | "virtual" | "live_audio" | "podcast_recording" | "hybrid" | "remote_conference";
export type VirtualSession = { externalId?: string; sessionId?: string; joinUrl: string; hostUrl?: string; recordingUrl?: string };
export interface VirtualEventProvider {
  key: string; label: string; kind: "video" | "audio" | "stream";
  env: string[];                                  // credentials an API adapter needs
  supportsApi: boolean;                           // can create sessions / per-attendee links automatically
  createSession?(o: { title: string; startsAt: string; endsAt: string | null; timezone: string; capacity?: number | null }): Promise<VirtualSession>;
}
const configured = (env: string[]) => env.every(k => !!process.env[k]);

export const VIRTUAL_PROVIDERS: VirtualEventProvider[] = [
  { key: "manual", label: "Any platform (paste links)", kind: "video", env: [], supportsApi: false },
  { key: "zoom", label: "Zoom", kind: "video", env: ["ZOOM_ACCOUNT_ID", "ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET"], supportsApi: true },
  { key: "teams", label: "Microsoft Teams", kind: "video", env: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_TENANT_ID"], supportsApi: true },
  { key: "google_meet", label: "Google Meet", kind: "video", env: ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET"], supportsApi: true },
  { key: "youtube_live", label: "YouTube Live", kind: "stream", env: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"], supportsApi: true },
  { key: "vimeo", label: "Vimeo", kind: "stream", env: ["VIMEO_ACCESS_TOKEN"], supportsApi: true },
  { key: "streamyard", label: "StreamYard", kind: "stream", env: [], supportsApi: false },
  { key: "riverside", label: "Riverside (podcast recording)", kind: "audio", env: [], supportsApi: false },
  { key: "spotify_live", label: "Spotify Live / audio stream", kind: "audio", env: [], supportsApi: false },
  { key: "other", label: "Other", kind: "video", env: [], supportsApi: false },
];
export const providerStatus = (p: VirtualEventProvider) => !p.supportsApi ? "manual_links" : configured(p.env) ? "api_ready" : "blocked_external_configuration";
export const FORMAT_LABEL: Record<VirtualFormat, string> = { webinar: "Webinar", virtual: "Virtual event", live_audio: "Live audio", podcast_recording: "Podcast live recording", hybrid: "Hybrid event", remote_conference: "Remote conference" };
