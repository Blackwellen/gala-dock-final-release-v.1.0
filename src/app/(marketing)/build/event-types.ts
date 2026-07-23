// Gala Dock — consumer-facing event types for the "build my event" quiz. Reuses names from the
// internal src/lib/events/event-types.ts TYPE_META where they exist (wedding, birthday,
// childrens_party, private_party) and adds a few consumer-only extras that aren't part of the
// organizer-facing event pipeline taxonomy.
export const BUILD_EVENT_TYPES = [
  { value: "childrens_party", label: "Kids' birthday party" },
  { value: "birthday", label: "Adult birthday" },
  { value: "christening", label: "Christening / naming day" },
  { value: "baby_shower", label: "Baby shower" },
  { value: "engagement", label: "Engagement party" },
  { value: "wedding", label: "Wedding" },
  { value: "garden_party", label: "Garden party / BBQ" },
  { value: "private_party", label: "Private party" },
  { value: "other", label: "Something else" },
] as const;
