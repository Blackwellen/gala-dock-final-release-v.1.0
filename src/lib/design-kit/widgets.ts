// Widget catalogue for Media Studio: parametric event widgets (countdown, timeline, ticket stub, agenda, ratings, charts…).
// Each widget type × 6 style variants × 12 colour themes ≈ 1,900 ready-made combinations; every text and colour stays editable.
export type WidgetTheme = { a: string; b: string; text: string; bg: string };
export type WidgetField = { key: string; label: string; kind: "text" | "number" | "list" | "date" };
export type WidgetDef = { id: string; name: string; group: string; w: number; h: number; fields: WidgetField[]; props: Record<string, string | number> };

export const VARIANTS = ["Filled", "Outline", "Minimal", "Rounded", "Glass", "Bold"] as const;
export const THEMES: { name: string; theme: WidgetTheme }[] = [
  { name: "Gala", theme: { a: "#0b08f8", b: "#5b6bff", text: "#ffffff", bg: "#090a2e" } }, { name: "Light", theme: { a: "#0b08f8", b: "#e8ebff", text: "#090a2e", bg: "#ffffff" } },
  { name: "Gold", theme: { a: "#c9a227", b: "#f4e4b0", text: "#ffffff", bg: "#0b0c2a" } }, { name: "Neon", theme: { a: "#ff2a6d", b: "#05d9e8", text: "#ffffff", bg: "#0d0221" } },
  { name: "Blush", theme: { a: "#b5838d", b: "#f6c6c6", text: "#3d2b30", bg: "#fff1f0" } }, { name: "Sage", theme: { a: "#52796f", b: "#cad2c5", text: "#1f2e2b", bg: "#f4f1e8" } },
  { name: "Sunset", theme: { a: "#ff6b35", b: "#f7c59f", text: "#ffffff", bg: "#1a1a2e" } }, { name: "Ocean", theme: { a: "#0077b6", b: "#90e0ef", text: "#03045e", bg: "#caf0f8" } },
  { name: "Mono", theme: { a: "#111111", b: "#888888", text: "#111111", bg: "#ffffff" } }, { name: "Royal", theme: { a: "#7b2cbf", b: "#ffd60a", text: "#ffffff", bg: "#240046" } },
  { name: "Citrus", theme: { a: "#f8961e", b: "#90be6d", text: "#1b1b1b", bg: "#fffbea" } }, { name: "Rose", theme: { a: "#e11d48", b: "#fecdd3", text: "#ffffff", bg: "#4c0519" } },
];
const T = (key: string, label: string): WidgetField => ({ key, label, kind: "text" });
const N = (key: string, label: string): WidgetField => ({ key, label, kind: "number" });
const L = (key: string, label: string): WidgetField => ({ key, label, kind: "list" });
export const WIDGETS: WidgetDef[] = [
  { id: "countdown", name: "Countdown", group: "Time", w: 760, h: 220, fields: [T("label", "Label"), N("days", "Days"), N("hours", "Hours"), N("mins", "Minutes"), N("secs", "Seconds")], props: { label: "Doors open in", days: 12, hours: 8, mins: 45, secs: 30 } },
  { id: "date-block", name: "Date block", group: "Time", w: 260, h: 300, fields: [T("month", "Month"), T("day", "Day"), T("weekday", "Weekday")], props: { month: "JUN", day: "21", weekday: "Saturday" } },
  { id: "time-block", name: "Time", group: "Time", w: 420, h: 160, fields: [T("time", "Time"), T("label", "Label")], props: { time: "19:30", label: "Doors" } },
  { id: "calendar", name: "Calendar month", group: "Time", w: 520, h: 520, fields: [T("title", "Month"), N("start", "First weekday (0=Mon)"), N("days", "Days in month"), N("day", "Highlighted day")], props: { title: "June 2026", start: 0, days: 30, day: 21 } },
  { id: "timeline-h", name: "Timeline (horizontal)", group: "Schedule", w: 1000, h: 260, fields: [L("items", "Items (time | title per line)")], props: { items: "18:00 | Doors\n19:00 | Support act\n20:30 | Headliner\n23:00 | Close" } },
  { id: "timeline-v", name: "Timeline (vertical)", group: "Schedule", w: 520, h: 640, fields: [L("items", "Items (time | title per line)")], props: { items: "09:00 | Registration\n10:00 | Keynote\n12:30 | Lunch\n14:00 | Workshops\n17:00 | Drinks" } },
  { id: "agenda", name: "Agenda", group: "Schedule", w: 640, h: 560, fields: [T("title", "Title"), L("items", "Items (time | title per line)")], props: { title: "Running order", items: "18:00 | Arrivals & fizz\n19:00 | Dinner\n21:00 | Speeches\n21:30 | First dance\n22:00 | Party" } },
  { id: "lineup", name: "Line-up", group: "Schedule", w: 720, h: 560, fields: [T("title", "Title"), L("items", "Names (headliner first)")], props: { title: "LINE-UP", items: "THE HEADLINERS\nSpecial Guest\nDJ Night Shift\nSupport Act\nResident DJs" } },
  { id: "ticket", name: "Ticket stub", group: "Tickets", w: 900, h: 340, fields: [T("event", "Event"), T("date", "Date"), T("tier", "Tier"), T("price", "Price"), T("seat", "Seat")], props: { event: "Summer Gala", date: "Sat 21 June · 19:30", tier: "VIP", price: "£45", seat: "Row B · Seat 12" } },
  { id: "price-tag", name: "Price tag", group: "Tickets", w: 360, h: 220, fields: [T("label", "Label"), T("price", "Price"), T("note", "Note")], props: { label: "Tickets from", price: "£25", note: "+ booking fee" } },
  { id: "stamp", name: "Stamp", group: "Tickets", w: 420, h: 200, fields: [T("text", "Text"), T("sub", "Small text")], props: { text: "SOLD OUT", sub: "Thank you" } },
  { id: "badge-age", name: "Age / entry badge", group: "Tickets", w: 220, h: 220, fields: [T("text", "Text"), T("sub", "Small text")], props: { text: "18+", sub: "ID required" } },
  { id: "rating", name: "Star rating", group: "Social proof", w: 520, h: 120, fields: [N("value", "Rating (0–5)"), T("label", "Label")], props: { value: 4.8, label: "2,140 reviews" } },
  { id: "quote", name: "Quote", group: "Social proof", w: 760, h: 360, fields: [T("text", "Quote"), T("author", "Author")], props: { text: "The best night out in town.", author: "Time Out" } },
  { id: "stat", name: "Big number", group: "Social proof", w: 400, h: 240, fields: [T("value", "Number"), T("label", "Label")], props: { value: "5,000+", label: "Guests last year" } },
  { id: "progress", name: "Progress bar", group: "Data", w: 760, h: 140, fields: [N("value", "Percent"), T("label", "Label")], props: { value: 72, label: "Tickets sold" } },
  { id: "ring", name: "Progress ring", group: "Data", w: 300, h: 300, fields: [N("value", "Percent"), T("label", "Label")], props: { value: 85, label: "Sold" } },
  { id: "bars", name: "Bar chart", group: "Data", w: 720, h: 420, fields: [T("title", "Title"), L("items", "Bars (label | value per line)")], props: { title: "Ticket sales", items: "Mon | 120\nTue | 180\nWed | 240\nThu | 310\nFri | 420" } },
  { id: "donut", name: "Donut chart", group: "Data", w: 420, h: 420, fields: [L("items", "Slices (label | value per line)")], props: { items: "Standard | 60\nVIP | 25\nEarly bird | 15" } },
  { id: "checklist", name: "Checklist", group: "Info", w: 560, h: 420, fields: [T("title", "Title"), L("items", "Items (one per line)")], props: { title: "What to bring", items: "Your ticket (on your phone)\nPhoto ID\nA jacket for the terrace\nGood vibes" } },
  { id: "location", name: "Location", group: "Info", w: 640, h: 180, fields: [T("venue", "Venue"), T("address", "Address")], props: { venue: "Riverside Arena", address: "1 River Way, London SE1" } },
  { id: "contact", name: "Contact card", group: "Info", w: 640, h: 260, fields: [T("phone", "Phone"), T("email", "Email"), T("web", "Website")], props: { phone: "020 7946 0000", email: "hello@yourevent.com", web: "yourevent.com" } },
  { id: "social", name: "Social handle", group: "Info", w: 560, h: 120, fields: [T("handle", "Handle"), T("platform", "Platform")], props: { handle: "@yourevent", platform: "Follow us" } },
  { id: "hashtag", name: "Hashtag", group: "Info", w: 560, h: 140, fields: [T("tag", "Hashtag")], props: { tag: "#SummerGala26" } },
  { id: "wifi", name: "Wi-Fi card", group: "Info", w: 520, h: 240, fields: [T("network", "Network"), T("password", "Password")], props: { network: "Gala-Guests", password: "celebrate2026" } },
  { id: "sponsors", name: "Sponsor strip", group: "Info", w: 1100, h: 180, fields: [T("title", "Title"), L("items", "Sponsors (one per line)")], props: { title: "Supported by", items: "Acme Drinks\nNorthwind\nContoso Audio\nFabrikam" } },
  { id: "divider", name: "Ornamental divider", group: "Decor", w: 760, h: 80, fields: [T("text", "Centre text")], props: { text: "✦" } },
];
export const widgetById = (id: string) => WIDGETS.find(w => w.id === id) ?? null;
export const widgetCount = () => WIDGETS.length * VARIANTS.length * THEMES.length;
export const listItems = (v: string | number | undefined) => String(v ?? "").split("\n").map(s => s.trim()).filter(Boolean).slice(0, 12);
export const pairItems = (v: string | number | undefined) => listItems(v).map(s => { const [a, ...b] = s.split("|"); return [a!.trim(), b.join("|").trim()] as const; });
