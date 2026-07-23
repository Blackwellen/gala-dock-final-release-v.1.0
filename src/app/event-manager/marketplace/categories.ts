// Gala Dock — shared marketplace category taxonomy. One source used by both the "My Listings"
// create/edit form and the cross-persona browse catalog filter.

export const MARKETPLACE_CATEGORIES = [
  { value: "venue", label: "Venue & Space" },
  { value: "catering", label: "Food & Drink" },
  { value: "entertainment", label: "Entertainment" },
  { value: "play_activity", label: "Play & Activity" },
  { value: "decor_styling", label: "Décor & Styling" },
  { value: "photo_video", label: "Photo / Video" },
  { value: "logistics", label: "Logistics & Hire" },
  { value: "extras", label: "Extras" },
] as const;

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number]["value"];

export function categoryLabel(value: string): string {
  return MARKETPLACE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export const PRICE_UNITS = [
  { value: "fixed", label: "Fixed price" },
  { value: "per_hour", label: "Per hour" },
  { value: "per_head", label: "Per head" },
  { value: "per_day", label: "Per day" },
] as const;
