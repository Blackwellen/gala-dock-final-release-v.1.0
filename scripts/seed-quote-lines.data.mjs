// Shared demo line items for the "Charity Gala Dinner" quote (seed-provider-admin.mjs and seed-quote-lines.mjs).
const img = n => `/assets/gd/${n}.webp`;
export const GALA_LINES = [
  { label: "Main Hall hire", kind: "space", detail: "Exclusive use with stage, dance floor and terrace access", qty: 5, unit: "hours", unit_price: 450, image: img("v-grand-hall") },
  { label: "Gala dinner — 3 courses", kind: "catering", detail: "Starter, main and dessert (220 guests)", qty: 220, unit: "guest", unit_price: 22, image: img("s-gourmet") },
  { label: "Drinks reception", kind: "catering", detail: "Prosecco and soft drinks on arrival", qty: 220, unit: "guest", unit_price: 6, image: img("bc-riverside-bars") },
  { label: "AV & staging", kind: "service", detail: "Lectern, 2 radio mics, screen and lighting", qty: 1, unit: "package", unit_price: 650, image: img("s-sound-lighting") },
  { label: "Event staffing", kind: "staff", detail: "Event manager, floor staff and bar team", qty: 1, unit: "package", unit_price: 550, image: img("type-private-dinner") },
  { label: "Setup & breakdown", kind: "setup", detail: "Event-day setup, teardown and venue reset", qty: 1, unit: "package", unit_price: 250, image: img("v-riverside-events-centre") },
];
