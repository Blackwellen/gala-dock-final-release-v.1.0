export type GalaWorkspaceType = "organizer" | "venue" | "supplier";
export type GalaWorkspaceSubtype = "event-manager" | "event-agency" | "corporate-events" | "venue-organisation" | "supplier-solo" | "supplier-team" | "performer";

export type GalaDemoWorkspace = {
  id: string;
  name: string;
  type: GalaWorkspaceType;
  subtype: GalaWorkspaceSubtype;
  subscription: "Growth" | "Scale" | "Enterprise";
  onboarding: "complete";
  ownerEmail: "jamahlthomas1996@gmail.com";
  contextLabel: string;
};

/**
 * Development shell fixtures. Their stable UUIDs intentionally match the
 * idempotent Supabase seed so the switcher can be exercised with real
 * memberships; the UI itself never writes these records directly.
 */
export const GALA_DEMO_USER = {
  email: "jamahlthomas1996@gmail.com" as const,
  name: "Jamahl Thomas",
};

export const GALA_DEMO_WORKSPACES: readonly GalaDemoWorkspace[] = [
  { id: "36549daf-eb91-4fb0-9d24-29a407e8d8ee", name: "Jamahl Event Management", type: "organizer", subtype: "event-manager", subscription: "Growth", onboarding: "complete", ownerEmail: GALA_DEMO_USER.email, contextLabel: "Planning 3 active events" },
  { id: "fe33c7f5-27ee-427e-a73a-804568f17e0f", name: "Jamahl Event Agency", type: "organizer", subtype: "event-agency", subscription: "Scale", onboarding: "complete", ownerEmail: GALA_DEMO_USER.email, contextLabel: "Agency delivery workspace" },
  { id: "6622637b-d3b8-4297-afe4-0dd5ffaf98eb", name: "Jamahl Corporate Events", type: "organizer", subtype: "corporate-events", subscription: "Enterprise", onboarding: "complete", ownerEmail: GALA_DEMO_USER.email, contextLabel: "Corporate programme workspace" },
  { id: "8c4da205-55c3-4357-a0bc-bd74d8f70f60", name: "Jamahl Venue Group", type: "venue", subtype: "venue-organisation", subscription: "Scale", onboarding: "complete", ownerEmail: GALA_DEMO_USER.email, contextLabel: "2 venues · 8 upcoming bookings" },
  { id: "d991eabb-70d5-4fdc-af6d-325125b1d04e", name: "Jamahl Supplier Studio", type: "supplier", subtype: "supplier-solo", subscription: "Growth", onboarding: "complete", ownerEmail: GALA_DEMO_USER.email, contextLabel: "Independent supplier workspace" },
  { id: "746693f2-c70a-4e64-bc0d-316b0a218d69", name: "Jamahl Supplier Collective", type: "supplier", subtype: "supplier-team", subscription: "Scale", onboarding: "complete", ownerEmail: GALA_DEMO_USER.email, contextLabel: "Team supplier workspace" },
  { id: "46dafc4e-e05c-41c9-80e8-78d3ae94f9e5", name: "Jamahl Live Entertainment", type: "supplier", subtype: "performer", subscription: "Scale", onboarding: "complete", ownerEmail: GALA_DEMO_USER.email, contextLabel: "Performer & entertainment provider" },
] as const;

export function getGalaDemoWorkspace(type: GalaWorkspaceType, id?: string | null): GalaDemoWorkspace {
  return GALA_DEMO_WORKSPACES.find((workspace) => workspace.type === type && workspace.id === id)
    ?? GALA_DEMO_WORKSPACES.find((workspace) => workspace.type === type)
    ?? GALA_DEMO_WORKSPACES[0];
}
