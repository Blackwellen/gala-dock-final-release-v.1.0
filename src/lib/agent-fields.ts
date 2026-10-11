import { bookingModes, capacityBands, countries, currencies, customerInterests, leadTimes, organizerBusinessTypes, organizerEventTypes, responseTimes, serviceCategories, venueTypes } from "./onboarding-schema";

/** What the Gala Agent may read and suggest on each onboarding step. Suggestions only; never sensitive settings. */
export const agentFields = {
  experience: {
    task: "Explain which Gala Dock experience fits what the user describes: customer (tickets, personal events), organizer (professional event running), or provider (venues and/or services in one workspace). Give one suggestion for the path field.",
    context: { question: 1 },
    suggest: { path: ["customer", "organizer", "provider"] } as Record<string, readonly string[] | "text">,
  },
  preferences: {
    task: "Suggest event interests from what the user voluntarily shared.",
    context: { home_area: 1, interests: 1 },
    suggest: { interests: customerInterests } as Record<string, readonly string[] | "text">,
  },
  organisation: {
    task: "Suggest a timezone, default currency and business type for a new event organiser workspace.",
    context: { name: 1, business_type: 1, country: 1, website: 1 },
    suggest: { timezone: countries.flatMap(c => c.timezones.map(t => t.value)), currency: currencies.map(c => c.value), business_type: organizerBusinessTypes } as Record<string, readonly string[] | "text">,
  },
  operating: {
    task: "Suggest event types and a typical capacity band for this organiser, and explain which starter playbooks fit.",
    context: { event_types: 1, capacity: 1, event_access: 1 },
    suggest: { event_types: organizerEventTypes, capacity: capacityBands } as Record<string, readonly string[] | "text">,
  },
  team: {
    task: "Suggest a sensible first event template for this organiser to start with.",
    context: { first_event_template: 1 },
    suggest: { first_event_template: ["Wedding", "Corporate Event", "Festival / Concert", "Private Party"] } as Record<string, readonly string[] | "text">,
  },
  business: {
    task: "Suggest service categories and capabilities that match this provider business.",
    context: { name: 1, location: 1, capabilities: 1, service_categories: 1 },
    suggest: { service_categories: serviceCategories } as Record<string, readonly string[] | "text">,
  },
  offer: {
    task: "Draft an appealing, accurate listing description (60-120 words) from the details given, and suggest a category or venue type. Do not invent facilities or capacities that were not provided.",
    context: { kind: 1, listing_name: 1, venue_type: 1, category: 1, location: 1, capacity: 1, amenities: 1, description: 1 },
    suggest: { description: "text", venue_type: venueTypes, category: serviceCategories } as Record<string, readonly string[] | "text">,
  },
  rules: {
    task: "Review these booking rules for contradictions (for example emergency availability with slow responses or long lead times) and suggest safer settings.",
    context: { booking_mode: 1, response_time: 1, lead_time: 1, emergency: 1, standby: 1, conditional_holds: 1 },
    suggest: { booking_mode: bookingModes, response_time: responseTimes, lead_time: leadTimes } as Record<string, readonly string[] | "text">,
  },
} as const;
export type AgentStep = keyof typeof agentFields;
