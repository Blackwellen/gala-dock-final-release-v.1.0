// One vocabulary for template filters — used by the Templates search, "Share as a template" and "Share to community",
// so whatever people label when they share is exactly what others can filter by.
export type Opt = { v: string; l: string };
const o = (pairs: string): Opt[] => pairs.split("|").map(p => { const [v, l] = p.split(":"); return { v: v!, l: l ?? v! }; });

export const AUDIENCES = o("organiser:Event organisers|provider:Venues & suppliers|both:Everyone");

/** What the design is for. Grouped so the select stays scannable. */
export const PURPOSE_GROUPS: { group: string; audience: "organiser" | "provider" | "both"; items: Opt[] }[] = [
  { group: "Ticket sales", audience: "organiser", items: o("ticket_launch:On sale / launch|early_bird:Early bird|final_release:Final release|sold_out:Sold out|countdown:Countdown|price_drop:Offer / discount code") },
  { group: "Event promotion", audience: "organiser", items: o("announcement:Announcement|line_up:Line-up|save_the_date:Save the date|invitation:Invitation|event_day:On the day|schedule:Schedule / running order|sponsor:Sponsors|thank_you:Thank you / recap|recruitment:Volunteers & staff") },
  { group: "Venue & business", audience: "provider", items: o("venue_showcase:Venue showcase|venue_hire:Venue hire|now_booking:Now taking bookings|availability:Availability / dates left|open_day:Open day / viewing|wedding_fair:Wedding fair|corporate_hire:Corporate & private hire|christmas_parties:Christmas parties") },
  { group: "Services & pricing", audience: "provider", items: o("packages:Packages|price_list:Price list / rate card|special_offer:Special offer|seasonal_offer:Seasonal offer|gift_voucher:Gift voucher|new_service:New service / launch|portfolio:Portfolio / gallery|testimonial:Testimonial / review|meet_the_team:Meet the team|behind_the_scenes:Behind the scenes|faq:FAQs") },
  { group: "Food & drink", audience: "both", items: o("menu:Menu|drinks:Drinks list|catering:Catering|tasting:Tasting / open kitchen") },
  { group: "On site", audience: "both", items: o("signage:Signage & wayfinding|welcome:Welcome screen|table_plan:Table plan|info_board:Info board") },
];
export const PURPOSES: Opt[] = PURPOSE_GROUPS.flatMap(g => g.items);

export const EVENT_TYPES = o("nightclub:Club night|festival:Festival|concert:Concert / gig|wedding:Wedding|birthday:Birthday|childrens_party:Children’s party|private_party:Private party|corporate:Corporate|conference:Conference|networking:Networking|webinar:Webinar / online|comedy:Comedy|theatre:Theatre|sports:Sports|charity:Charity / fundraiser|food_drink:Food & drink|arts:Art & culture|community:Community|religious:Faith & cultural|graduation:Graduation / prom|seasonal:Seasonal / holiday");

export const BUSINESS_TYPES = o("venue:Venue|catering:Catering|bar:Bar & drinks|dj:DJ|band:Live music|entertainment:Entertainers|photography:Photography|videography:Videography|decor:Décor & styling|florist:Florist|lighting_av:Lighting & AV|cakes:Cakes & desserts|hair_makeup:Hair & make-up|transport:Transport|security:Security & staffing|furniture:Furniture & marquees|planner:Planner / coordinator|kids:Kids’ entertainment|stationery:Stationery & print");

export const STYLES = o("elegant:Elegant|luxury:Luxury|bold:Bold|minimal:Minimal|modern:Modern|editorial:Editorial|playful:Playful|retro:Retro|neon:Neon|rustic:Rustic|botanical:Botanical|corporate:Corporate|festive:Festive|photo:Photo-led|typographic:Typographic");

export const PALETTES = o("black_gold:Black & gold|dark:Dark|light:Light & airy|pastel:Pastel|bright:Bright|monochrome:Monochrome|blue:Blue|green:Green|red:Red|pink:Pink|purple:Purple|orange:Orange & warm|earthy:Earthy & natural|neutral:Neutral / cream");

export const FORMATS = o("portrait:Portrait post (4:5)|square:Square post|story:Story / reel|poster:Poster & flyer (A-size)|landscape:Landscape / screen|banner:Banner / header");

export const SORTS = o("popular:Most used|newest:Newest|az:A–Z");

export type TemplateFilters = { audience?: string; purpose?: string; eventType?: string; business?: string; style?: string; palette?: string; format?: string; sort?: string };
export const FILTER_KEYS = ["audience", "purpose", "eventType", "business", "style", "palette", "format"] as const;
export const labelOf = (list: Opt[], v?: string) => list.find(x => x.v === v)?.l ?? v ?? "";
