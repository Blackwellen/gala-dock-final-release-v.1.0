// Emergency Supply categories (§37). Keys are stored on requests and provider opt-in profiles.
export const EMERGENCY_CATEGORIES: [string, string][] = [
  ["venue", "Venue"], ["dj", "DJ"], ["security", "Security"], ["catering", "Catering"], ["photographer", "Photographer"], ["videographer", "Videographer"],
  ["entertainment", "Entertainment"], ["staffing", "Event staff"], ["av", "AV & sound"], ["staging", "Staging"], ["generator", "Generator & power"],
  ["bar", "Bar"], ["transportation", "Transport"], ["equipment", "Equipment hire"],
];
export const categoryLabel = (k: string) => EMERGENCY_CATEGORIES.find(([key]) => key === k)?.[1] ?? k;
export const SEVERITY: Record<string, [string, "red" | "orange" | "blue"]> = { critical: ["Critical", "red"], high: ["High", "orange"], standard: ["Standard", "blue"] };
export const CANDIDATE_STATUS: Record<string, [string, "green" | "blue" | "orange" | "red" | "grey" | "purple"]> = {
  delivered: ["Sent", "grey"], opened: ["Seen", "blue"], interested: ["Interested", "purple"], quoted: ["Quoted", "green"], declined: ["Declined", "red"],
  accepted: ["Accepted", "green"], not_selected: ["Not selected", "grey"], expired: ["Expired", "grey"],
};
