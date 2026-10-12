// Widget preset library: ready-made widget types (kind + content) grouped for search. Generated from content packs so every
// preset is a distinct, named widget an organiser would actually use (≈1,700). Rendered by WidgetView; all text stays editable.
import { WIDGETS } from "./widgets";

export type WidgetPreset = { id: string; name: string; group: string; widget: string; props: Record<string, string | number>; w: number; h: number; variant?: number };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const BADGES = ["VIP", "Sold out", "Free entry", "New", "Limited", "18+", "21+", "Early bird", "Last chance", "Members only", "Guest list", "Backstage", "Press", "Staff", "Crew", "Artist",
  "All access", "Plus one", "Family friendly", "Dog friendly", "Vegan", "Vegetarian", "Gluten free", "Halal", "Kosher", "Dairy free", "Nut free", "Chef’s choice", "Bestseller", "Spicy",
  "2 for 1", "Happy hour", "Free drink", "Free shuttle", "Live now", "Tonight", "Today", "Tomorrow", "This weekend", "Opening night", "Closing night", "Premiere", "Exclusive",
  "Award winner", "Nominee", "Headliner", "Special guest", "Resident", "Guest DJ", "Encore", "Sell-out risk", "Final release", "Low stock", "Waitlist", "Coming soon", "Announced",
  "Rescheduled", "Postponed", "Cancelled", "New date", "Doors open", "Last entry", "No re-entry", "Cashless", "Card only", "Cash bar", "Open bar", "Free wifi", "Accessible",
  "Step-free", "BSL interpreted", "Captioned", "Relaxed performance", "Quiet room", "Kids go free", "Under 5s free", "Students", "Seniors", "Groups", "Couples", "Singles night",
  "Black tie", "Cocktail attire", "Fancy dress", "All white", "Masquerade", "Silent disco", "Karaoke", "Quiz night", "Bingo", "Comedy", "Live music", "DJ set", "Acoustic",
  "Unplugged", "Workshop", "Masterclass", "Keynote", "Panel", "Networking", "Q&A", "Book signing", "Meet & greet", "Tasting", "Pop-up", "Market", "Fair", "Gala", "Charity",
  "Fundraiser", "Raffle", "Auction", "Prize draw", "Giveaway", "Free gift", "Goody bag", "Photo booth", "Selfie spot", "Instagrammable", "Eco friendly", "Zero waste", "Plastic free", "Local produce"];
const SHAPES = ["pill", "rect", "circle", "seal", "ribbon", "tag", "star"];
const PLACES = ["Toilets", "Accessible toilet", "Exit", "Fire exit", "Entrance", "Main entrance", "Bar", "Main bar", "Cocktail bar", "Stage", "Main stage", "Second stage", "Cloakroom",
  "First aid", "Box office", "Ticket collection", "Car park", "Taxis", "Shuttle bus", "Food court", "Street food", "VIP area", "VIP lounge", "Smoking area", "Lifts", "Stairs",
  "Reception", "Registration", "Main hall", "Ballroom", "Room 1", "Room 2", "Room 3", "Room 4", "Breakout rooms", "Garden", "Terrace", "Rooftop", "Dance floor", "Photo booth",
  "Merch", "Cash machine", "Charging station", "Lost property", "Quiet room", "Baby change", "Prayer room", "Water refill", "Information", "Welfare", "Security", "Lockers",
  "Ceremony", "Reception drinks", "Dinner", "Exhibition", "Sponsors", "Press area", "Green room", "Staff only"];
const ARROWS = ["right", "left", "up", "down"];
const TABLE_NAMES = ["Rose", "Lily", "Peony", "Orchid", "Tulip", "Daisy", "Iris", "Jasmine", "Magnolia", "Lavender", "Oak", "Willow", "Birch", "Cedar", "Maple", "Elm", "Ash", "Pine",
  "London", "Paris", "Rome", "New York", "Tokyo", "Lisbon", "Barcelona", "Vienna", "Sydney", "Dubai", "Ruby", "Emerald", "Sapphire", "Diamond", "Pearl", "Gold", "Silver", "Amber",
  "Mercury", "Venus", "Jupiter", "Saturn"];
const ROLES = ["Speaker", "Staff", "Volunteer", "Press", "VIP", "Exhibitor", "Sponsor", "Organiser", "Crew", "Security", "Medic", "Artist", "Guest", "Delegate", "Host", "Judge", "Steward", "Photographer"];
const TIERS: [string, string, string][] = [["General admission", "£25", "Entry to the event\nAccess to all bars\nFree cloakroom"], ["VIP", "£95", "Priority entry\nVIP lounge & bar\nWelcome drink\nBest views"],
  ["Early bird", "£19", "Limited release\nSame great night\nSave 25%"], ["Student", "£15", "Valid student ID required\nEntry before 11pm"], ["Group of 4", "£80", "Four tickets\nReserved area\nSave £20"],
  ["Family", "£60", "2 adults + 2 children\nKids activity zone"], ["Backstage", "£150", "Meet the artists\nBackstage tour\nSigned poster"], ["Table for 10", "£950", "Private table\nBottle service\nHost"],
  ["Weekend pass", "£140", "Friday to Sunday\nAll stages\nRe-entry allowed"], ["Day pass", "£65", "One day entry\nAll stages"], ["Camping", "£45", "Pitch for 2\nShowers & toilets\nAdd to any pass"],
  ["Premium", "£120", "Premium seating\nDrinks package\nGift bag"], ["Platinum", "£250", "Front row\nChampagne reception\nAfter-party"], ["Gold", "£150", "Priority seating\nWelcome drink"],
  ["Silver", "£85", "Reserved seating"], ["Bronze", "£45", "Standard seating"], ["Standing", "£30", "Standing area\nBest atmosphere"], ["Seated", "£40", "Allocated seat"],
  ["Balcony", "£35", "Balcony seat\nGreat sightlines"], ["Dinner & show", "£79", "Three-course dinner\nShow ticket\nGlass of fizz"]];
const DISHES: [string, string, string, string][] = [["Burrata", "Heritage tomatoes, basil oil, sourdough", "£9", "V"], ["Salmon tartare", "Cucumber, dill, rye crisp", "£11", ""], ["Soup of the day", "Warm bread, salted butter", "£7", "V"],
  ["Roast chicken", "Truffle jus, pommes purée", "£24", ""], ["Sea bass", "Samphire, beurre blanc", "£26", ""], ["Squash risotto", "Sage, parmesan, pine nuts", "£19", "V"], ["Beef fillet", "Peppercorn sauce, fries", "£32", ""],
  ["Vegan curry", "Coconut, chickpea, jasmine rice", "£16", "VG"], ["Fish & chips", "Mushy peas, tartare sauce", "£18", ""], ["Wagyu burger", "Brioche, cheddar, fries", "£20", ""], ["Margherita", "San Marzano, fior di latte", "£12", "V"],
  ["Caesar salad", "Gem, parmesan, anchovy", "£13", ""], ["Chocolate délice", "Salted caramel, crème fraîche", "£9", "V"], ["Lemon posset", "Shortbread", "£8", "V"], ["Cheese board", "Chutney, crackers", "£14", "V"],
  ["Sticky toffee pudding", "Vanilla ice cream", "£8", "V"], ["Espresso martini", "Vodka, coffee liqueur, espresso", "£11", ""], ["Aperol spritz", "Aperol, prosecco, soda", "£10", ""], ["Mojito", "Rum, lime, mint", "£10", ""],
  ["Negroni", "Gin, Campari, vermouth", "£11", ""], ["Old fashioned", "Bourbon, bitters, orange", "£12", ""], ["Margarita", "Tequila, lime, triple sec", "£11", ""], ["Pornstar martini", "Vodka, passion fruit, prosecco", "£11", ""],
  ["House red", "175ml glass", "£7", ""], ["House white", "175ml glass", "£7", ""], ["Prosecco", "125ml glass", "£8", ""], ["Champagne", "125ml glass", "£14", ""], ["Craft lager", "Pint", "£6.50", ""],
  ["IPA", "Pint", "£6.80", ""], ["Cider", "Pint", "£6", ""], ["Mocktail", "Seasonal fruits", "£6", "VG"], ["Soft drinks", "Coke, lemonade, juice", "£3", ""], ["Flat white", "Oat milk available", "£3.50", ""],
  ["Hot chocolate", "Whipped cream", "£4", "V"], ["Nachos", "Salsa, guacamole, sour cream", "£9", "V"], ["Wings", "Buffalo or BBQ", "£10", ""], ["Loaded fries", "Cheese, bacon, spring onion", "£8", ""],
  ["Churros", "Chocolate sauce", "£6", "V"], ["Ice cream", "Three scoops", "£5", "V"], ["Popcorn", "Sweet or salted", "£4", "VG"]];
const SPEAKERS: [string, string, string][] = [["Alex Morgan", "CEO, Brightline", "Keynote · 10:00"], ["Priya Shah", "Head of Product", "Building for scale · 11:30"], ["Sam Taylor", "Founder, Northwind", "Panel · 14:00"],
  ["Jordan Lee", "Creative Director", "Workshop · 15:30"], ["Maria García", "Chief Scientist", "Fireside chat · 16:30"], ["Chris Evans", "Comedian", "Headline set · 21:00"], ["Aisha Khan", "Chef", "Masterclass · 13:00"],
  ["Tom Wright", "Author", "Book signing · 17:00"], ["Lena Fischer", "DJ", "Closing set · 23:00"], ["Ben Okafor", "Host", "Welcome · 19:00"]];
const HOURS: [string, string][] = [["Opening hours", "Mon–Thu | 12:00–23:00\nFri | 12:00–01:00\nSat | 10:00–01:00\nSun | 10:00–22:00"], ["Festival times", "Friday | 14:00–23:00\nSaturday | 11:00–23:00\nSunday | 11:00–22:00"],
  ["Bar hours", "Main bar | 18:00–01:00\nCocktail bar | 19:00–00:00\nLast orders | 00:30"], ["Kitchen hours", "Lunch | 12:00–15:00\nDinner | 17:30–22:00"], ["Box office", "Mon–Fri | 10:00–18:00\nShow days | from 17:00"],
  ["Registration", "Day 1 | 08:00–10:00\nDay 2 | 08:30–09:30"], ["Exhibition", "Day 1 | 09:00–18:00\nDay 2 | 09:00–17:00"], ["Pool & spa", "Daily | 07:00–21:00"], ["Late licence", "Fri–Sat | until 03:00"], ["Market", "Saturdays | 09:00–16:00"]];
const STATS: [string, string][] = [["5,000+", "Guests last year"], ["98%", "Would come again"], ["40+", "Artists"], ["3", "Stages"], ["12", "Hours of music"], ["200+", "Speakers"], ["60", "Exhibitors"], ["£25k", "Raised for charity"],
  ["4.9★", "Average rating"], ["10th", "Anniversary"], ["2,140", "Tickets sold"], ["12 days", "To go"], ["150", "Seats left"], ["1,000+", "Attendees"], ["24", "Countries"], ["30", "Workshops"], ["8", "Food trucks"], ["100%", "Renewable power"]];
const QUOTES: [string, string][] = [["The best night out in town.", "Time Out"], ["Unmissable.", "The Guardian"], ["Pure magic from start to finish.", "Evening Standard"], ["A masterclass in hospitality.", "Guest review"],
  ["I’ve already booked for next year.", "Attendee"], ["Electric atmosphere.", "Mixmag"], ["Five stars.", "The Stage"], ["Our dream wedding venue.", "Sophie & James"], ["Incredibly well organised.", "Delegate"], ["Funniest show I’ve seen.", "Chortle"]];
const AGENDAS: [string, string, string][] = [["Wedding day", "Order of the day", "14:00 | Ceremony\n15:00 | Drinks reception\n17:30 | Wedding breakfast\n20:00 | First dance\n23:30 | Carriages"],
  ["Conference day 1", "Day one", "08:30 | Registration\n09:30 | Keynote\n11:00 | Breakouts\n13:00 | Lunch\n14:00 | Panels\n17:30 | Networking drinks"],
  ["Festival Saturday", "Saturday", "12:00 | Gates open\n14:00 | Local heroes\n17:00 | Sunset set\n20:00 | Co-headliner\n22:00 | Headliner"],
  ["Gala dinner", "This evening", "18:30 | Champagne reception\n19:30 | Dinner\n21:00 | Awards\n22:00 | Auction\n22:30 | Dancing"],
  ["Club night", "Set times", "22:00 | Warm-up\n23:30 | Support\n01:00 | Headliner\n03:00 | Close"], ["Kids party", "Party plan", "14:00 | Games\n15:00 | Magic show\n15:45 | Food\n16:30 | Cake\n17:00 | Party bags"],
  ["Workshop", "Workshop plan", "10:00 | Welcome\n10:15 | Session 1\n11:30 | Break\n11:45 | Session 2\n13:00 | Wrap-up"], ["Comedy night", "Running order", "19:30 | Doors\n20:00 | MC\n20:15 | Opener\n21:00 | Interval\n21:20 | Headliner"],
  ["Charity ball", "Programme", "19:00 | Arrivals\n19:45 | Dinner\n21:15 | Speeches\n21:45 | Live auction\n22:30 | Band"], ["Product launch", "Launch schedule", "18:00 | Doors\n18:30 | Welcome\n18:45 | Reveal\n19:15 | Demos\n20:00 | Drinks"]];
const CHECKLISTS: [string, string][] = [["What to bring", "Your ticket (on your phone)\nPhoto ID\nA jacket for later\nGood vibes"], ["Before you arrive", "Charge your phone\nCheck the weather\nPlan your journey\nBring cash for the cloakroom"],
  ["Camping kit", "Tent & sleeping bag\nHead torch\nWellies\nSun cream\nRefillable bottle"], ["Wedding guest", "RSVP by 1 May\nDress code: black tie\nGift list online\nTaxi booked"],
  ["Conference", "Laptop & charger\nBusiness cards\nBadge on arrival\nDownload the app"], ["House rules", "Respect each other\nNo glass outside\nDrink water\nAsk staff for help"],
  ["Kids party", "Party clothes\nWater bottle\nAllergies told to host\nCollection at 17:00"], ["Volunteer brief", "Arrive 30 minutes early\nWear your T-shirt\nCollect radio\nCheck in with lead"]];
const PRICE_TAGS: [string, string, string][] = [["Tickets from", "£25", "+ booking fee"], ["Early bird", "£19", "Limited release"], ["VIP", "£95", "Includes welcome drink"], ["Group ticket", "£80", "Four people"],
  ["Entry", "Free", "Register to attend"], ["Students", "£12", "With valid ID"], ["On the door", "£30", "Subject to availability"], ["Dinner & show", "£79", "Three courses"], ["Day pass", "£65", "All stages"], ["Weekend", "£140", "Fri–Sun"]];
const STAMPS: [string, string][] = [["SOLD OUT", "Thank you"], ["LAST FEW", "Book now"], ["NEW DATE", "Tickets valid"], ["EARLY BIRD", "Limited"], ["FREE", "Register now"], ["VIP", "Exclusive"], ["TONIGHT", "Doors 19:00"],
  ["CANCELLED", "Refunds automatic"], ["POSTPONED", "New date soon"], ["APPROVED", ""], ["PAID", ""], ["ADMIT ONE", ""], ["RESERVED", ""], ["ON SALE", "Now"], ["FINAL RELEASE", "Don’t miss out"]];
const COUNTDOWNS = ["Doors open in", "Tickets on sale in", "Early bird ends in", "Festival starts in", "Countdown to the big day", "Final release ends in", "Line-up reveal in", "Gates open in", "We’re live in", "Last orders in"];
const SOCIALS: [string, string][] = [["Instagram", "@yourevent"], ["TikTok", "@yourevent"], ["X", "@yourevent"], ["Facebook", "/yourevent"], ["YouTube", "@yourevent"], ["LinkedIn", "Your Company"], ["WhatsApp", "Join the group"], ["Spotify", "Event playlist"]];
const HASHTAGS = ["#SummerGala26", "#NightOut", "#WeddingDay", "#FestivalSeason", "#TechSummit", "#LiveMusic", "#ComedyNight", "#CharityBall", "#BirthdayBash", "#NewYearsEve"];

let cached: WidgetPreset[] | null = null;
export function widgetPresets(): WidgetPreset[] {
  if (cached) return cached;
  const out: WidgetPreset[] = [];
  const add = (group: string, name: string, widget: string, props: WidgetPreset["props"], w: number, h: number, variant?: number) => out.push({ id: `${widget}-${slug(name)}-${out.length}`, name, group, widget, props, w, h, variant });
  for (const b of BADGES) for (const sh of SHAPES) add("Badges & labels", `${b} ${sh} badge`, "badge", { text: b, shape: sh }, sh === "circle" || sh === "seal" || sh === "star" ? 300 : 420, sh === "circle" || sh === "seal" || sh === "star" ? 300 : 140);
  for (const pl of PLACES) for (const a of ARROWS) add("Signs & wayfinding", `${pl} ${a === "up" ? "ahead" : a}`, "sign", { text: pl, arrow: a }, 760, 160);
  for (const pl of PLACES) add("Signs & wayfinding", `${pl} sign`, "sign", { text: pl, arrow: "none" }, 760, 160);
  for (let i = 1; i <= 60; i++) add("Tables & place cards", `Table ${i}`, "table", { label: "Table", number: String(i), sub: "" }, 420, 520);
  for (const t of TABLE_NAMES) add("Tables & place cards", `Table ${t}`, "table", { label: "Table", number: t, sub: "" }, 520, 420);
  for (const r of ROLES) add("Name badges", `${r} badge`, "namebadge", { role: r, name: "Alex Morgan", company: "Your Company", event: "{{event.name}}" }, 400, 560);
  for (const [n, pr, perks] of TIERS) add("Ticket tiers", `${n} tier`, "tier", { name: n, price: pr, items: perks }, 520, 640);
  for (const [d, desc, pr, tags] of DISHES) add("Menu items", d, "menuitem", { dish: d, desc, price: pr, tags }, 760, 170);
  for (const [n, r, talk] of SPEAKERS) add("Speakers & artists", `${n} — ${r}`, "speaker", { name: n, role: r, talk }, 760, 220);
  for (const [t, items] of HOURS) add("Opening hours", t, "hours", { title: t, items }, 560, 420);
  for (const [v, l] of STATS) add("Stats & numbers", `${v} ${l}`, "stat", { value: v, label: l }, 400, 240);
  for (const [q, a] of QUOTES) add("Quotes & reviews", `“${q}”`, "quote", { text: q, author: a }, 760, 360);
  for (const [q, a] of QUOTES) add("Quotes & reviews", `Rating — ${a}`, "rating", { value: 4.8, label: a }, 520, 120);
  for (const [n, title, items] of AGENDAS) { add("Schedules & agendas", `${n} agenda`, "agenda", { title, items }, 640, 560); add("Schedules & agendas", `${n} timeline`, "timeline-v", { items }, 520, 640); add("Schedules & agendas", `${n} strip`, "timeline-h", { items: items.split("\n").slice(0, 5).join("\n") }, 1000, 260); }
  for (const [title, items] of CHECKLISTS) add("Checklists", title, "checklist", { title, items }, 560, 420);
  for (const [l, pr, note] of PRICE_TAGS) add("Prices", `${l} ${pr}`, "price-tag", { label: l, price: pr, note }, 360, 220);
  for (const [t, sub] of STAMPS) add("Stamps", `${t} stamp`, "stamp", { text: t, sub }, 420, 200);
  for (const c of COUNTDOWNS) add("Countdowns", c, "countdown", { label: c, days: 12, hours: 8, mins: 45, secs: 30 }, 760, 220);
  for (const [pl, h] of SOCIALS) add("Social", `${pl} ${h}`, "social", { platform: `Follow on ${pl}`, handle: h }, 560, 120);
  for (const h of HASHTAGS) add("Social", h, "hashtag", { tag: h }, 560, 140);
  for (const v of [25, 50, 72, 85, 92, 100]) { add("Progress", `${v}% sold bar`, "progress", { value: v, label: "Tickets sold" }, 760, 140); add("Progress", `${v}% ring`, "ring", { value: v, label: "Sold" }, 300, 300); }
  for (const d of WIDGETS) if (!out.some(o => o.widget === d.id)) add("More", d.name, d.id, { ...d.props }, d.w, d.h);
  return (cached = out);
}
