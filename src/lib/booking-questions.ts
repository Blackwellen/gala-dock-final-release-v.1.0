/** Provider questions asked in the booking request. A listing can override them via details.questions. */
export type BookingQuestion = { id: string; label: string; required: boolean; options: { value: string; label: string; sub?: string }[] };

const BY_CATEGORY: Record<string, BookingQuestion[]> = {
  venue: [
    { id: "layout", label: "What type of seating arrangement do you prefer?", required: true, options: [{ value: "round", label: "Round tables", sub: "8–10 per table" }, { value: "long", label: "Long tables", sub: "Family style" }, { value: "mixed", label: "Mixed", sub: "Combination" }, { value: "standing", label: "Standing only" }] },
    { id: "catering", label: "Do you require in-house catering?", required: true, options: [{ value: "full", label: "Yes, full catering" }, { value: "bar", label: "Yes, a bar only" }, { value: "own", label: "No, we'll arrange our own" }, { value: "unsure", label: "Not sure yet" }] },
    { id: "outdoor", label: "Do you need outdoor space?", required: false, options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "weather", label: "Only if weather allows" }] },
  ],
  food: [
    { id: "service", label: "What style of service would you like?", required: true, options: [{ value: "plated", label: "Plated", sub: "Served at table" }, { value: "buffet", label: "Buffet" }, { value: "family", label: "Sharing platters" }, { value: "canapes", label: "Canapés & bowls" }] },
    { id: "dietary", label: "Any dietary requirements to plan for?", required: true, options: [{ value: "none", label: "None known" }, { value: "some", label: "A few guests" }, { value: "many", label: "Many guests" }, { value: "unsure", label: "Not sure yet" }] },
  ],
  drinks: [
    { id: "bar", label: "What kind of bar do you need?", required: true, options: [{ value: "open", label: "Open bar", sub: "Pre-paid" }, { value: "cash", label: "Cash bar" }, { value: "mixed", label: "Tab then cash" }, { value: "soft", label: "Soft drinks only" }] },
  ],
  entertainment: [
    { id: "sets", label: "How long should they perform?", required: true, options: [{ value: "2h", label: "Up to 2 hours" }, { value: "4h", label: "Up to 4 hours" }, { value: "evening", label: "Full evening" }, { value: "unsure", label: "Not sure yet" }] },
    { id: "power", label: "Is power and a performance area available?", required: false, options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" }] },
  ],
  media: [
    { id: "coverage", label: "What coverage do you need?", required: true, options: [{ value: "ceremony", label: "Key moments" }, { value: "half", label: "Half day" }, { value: "full", label: "Full day" }, { value: "custom", label: "Custom" }] },
  ],
};
const GENERIC: BookingQuestion[] = [
  { id: "scope", label: "How would you describe what you need?", required: true, options: [{ value: "standard", label: "Their standard package" }, { value: "custom", label: "Something tailored" }, { value: "unsure", label: "Not sure yet" }] },
];

export function questionsFor(category: string, details: unknown): BookingQuestion[] {
  const custom = (details as { questions?: BookingQuestion[] } | null)?.questions;
  if (Array.isArray(custom) && custom.length) return custom.slice(0, 8);
  return BY_CATEGORY[category] ?? GENERIC;
}
