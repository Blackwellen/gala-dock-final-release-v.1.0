// W11 (GD-12): event-type rules the wizards mirror. The database is authoritative (event_type_profiles,
// event_lifecycle_blockers, trg_event_type_public_guard); this only keeps the UI from offering what the backend refuses.

/** Types whose profile has public_listing_allowed = false: always private, shared by private guest link. */
const NEVER_PUBLIC = new Set(["childrens_party"]);
export const neverPublic = (eventType: string | null | undefined) => !!eventType && NEVER_PUBLIC.has(eventType);
export const NEVER_PUBLIC_COPY = "Children’s parties are never listed publicly — share a private guest link instead.";
