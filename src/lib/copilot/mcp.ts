// Gala Dock — Copilot MCP adapter layer (V1-2 Phase 8). MCP = external capability bridges ONLY
// (email, calendar, maps, accounting, web). NEVER core logic (Supabase, graph, permissions,
// memory, slash commands stay internal). This registry defines the adapters the Execution Router
// can reach; each is config/connection-driven and gated. Real transport wires per adapter later.
// See docs/specs/COPILOT_ARCHITECTURE.md §11.

export type McpCapability = "email" | "calendar" | "maps" | "accounting" | "web_search" | "storage";

export interface McpAdapter {
  id: string;
  capability: McpCapability;
  label: string;
  description: string;
  /** Env var(s) that must be present for this adapter to be usable. */
  requiredEnv: string[];
}

export const MCP_ADAPTERS: McpAdapter[] = [
  { id: "resend-email", capability: "email", label: "Email (Resend)", description: "Send and template emails.", requiredEnv: ["RESEND_API_KEY"] },
  { id: "google-calendar", capability: "calendar", label: "Google Calendar", description: "Read/write calendar events.", requiredEnv: ["GOOGLE_OAUTH_CLIENT_ID"] },
  { id: "maps", capability: "maps", label: "Maps & places", description: "Geocoding and venue lookups.", requiredEnv: ["MAPS_API_KEY"] },
  { id: "xero", capability: "accounting", label: "Xero", description: "Sync invoices and payments.", requiredEnv: ["XERO_CLIENT_ID"] },
  { id: "web-search", capability: "web_search", label: "Web search", description: "External market/web lookups.", requiredEnv: ["WEB_SEARCH_API_KEY"] },
  { id: "r2-storage", capability: "storage", label: "Document storage (R2)", description: "Store and retrieve documents.", requiredEnv: ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] },
];

/** True when every required env var for an adapter is present (server-side check). */
export function isAdapterConnected(adapter: McpAdapter, env: Record<string, string | undefined> = process.env): boolean {
  return adapter.requiredEnv.every((k) => Boolean(env[k]));
}

export function connectedAdapters(env: Record<string, string | undefined> = process.env): McpAdapter[] {
  return MCP_ADAPTERS.filter((a) => isAdapterConnected(a, env));
}
