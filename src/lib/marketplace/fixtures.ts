// Gala Dock — Marketplace Phase 2 fixture data.
//
// Phase 2 of the marketplace rebuild is pixel-accuracy against the reference designs using
// component-driven demo fixtures (no live Supabase reads yet — see AGENTS.md marketplace brief,
// implementation order Phase 2). Every shape here is intentionally close to the eventual
// `marketplace_*` row shapes so Phase 4 can swap this module for real queries with minimal
// component changes. Do not import this file once live data wiring lands for a given page.

export type ListingAvailability = "available" | "limited" | "unavailable" | "contact";

export interface SupplierListing {
  id: string;
  slug: string;
  serviceId: string;
  serviceSlug: string;
  name: string;
  serviceName: string;
  category: string;
  logoInitial: string;
  logoTone: "dark" | "violet" | "navy";
  coverImage: string;
  verified: boolean;
  topRated?: boolean;
  featured?: boolean;
  preferred?: boolean;
  location: string;
  coverage: string;
  responseRate: number;
  responseTime: string;
  rating: number;
  reviewCount: number;
  leadTime: string;
  complianceGrade: "A" | "B" | "C";
  priceFromCents: number;
  priceUnit: "per_event" | "per_head" | "per_day" | "per_hour" | "per_staff" | "fixed";
  availability: ListingAvailability;
  availabilityDate?: string;
  tags: string[];
  description: string;
  eventsDelivered: number;
  yearsOnPlatform: number;
  founded: number;
  companySize: string;
  website: string;
  aboutBullets: string[];
  servicesOffered: { label: string; icon: string }[];
  eventTypes: string[];
  portfolio: string[];
  certifications: { label: string; sub: string }[];
  ratingBreakdown: { label: string; value: number }[];
  reviews: { author: string; company: string; rating: number; text: string; when: string }[];
  packages: {
    id: string;
    tier: "Essential" | "Professional" | "Premium";
    popular?: boolean;
    priceFromCents: number;
    unit: string;
    includes: string[];
  }[];
  included: string[];
  serviceAreaNote: { primary: string; secondary: string; global: string };
}

export interface VenueSpace {
  name: string;
  seated: number;
  standing: number;
  priceFromCents: number;
}

export interface VenueListing {
  id: string;
  slug: string;
  name: string;
  type: string;
  images: string[];
  verified: boolean;
  featured?: boolean;
  location: string;
  address: string;
  seatedCapacity: number;
  standingCapacity: number;
  availability: ListingAvailability;
  availabilityDate?: string;
  priceFromCents: number;
  responseTime: string;
  rating: number;
  reviewCount: number;
  amenities: string[];
  highlights: string[];
  accessible: boolean;
  description: string;
  spaces: VenueSpace[];
  ownerId: string;
  hostedEvents: string[];
  documents: { label: string; size: string }[];
}

export interface VenueOwner {
  id: string;
  slug: string;
  name: string;
  logoInitial: string;
  tagline: string;
  location: string;
  companyReg: string;
  founded: number;
  rating: number;
  reviewCount: number;
  responseRate: number;
  responseTime: string;
  acceptedBookingRate: number;
  venueIds: string[];
  about: string;
  preferredEventTypes: string[];
  operationalRegions: { region: string; count: number }[];
  accountManager: { name: string; role: string; email: string; phone: string };
  trust: { label: string; sub: string }[];
  recentEvents: { name: string; venue: string; guests: number; status: "Completed" | "Confirmed" }[];
}

export const SUPPLIERS: SupplierListing[] = [
  {
    id: "sup-floral-co",
    slug: "floral-co-events",
    serviceId: "svc-floral-styling",
    serviceSlug: "premium-styling-package",
    name: "Floral & Co. Events",
    serviceName: "Premium Styling & Floral Package",
    category: "Décor & Styling",
    logoInitial: "FLORAL & CO.",
    logoTone: "dark",
    coverImage: "linear-gradient(135deg,#2c1a3d,#4a2a52,#7c4a63)",
    verified: true,
    topRated: true,
    preferred: true,
    location: "London, UK",
    coverage: "UK Wide & International",
    responseRate: 98,
    responseTime: "2h",
    rating: 4.9,
    reviewCount: 256,
    leadTime: "7-14 days",
    complianceGrade: "A",
    priceFromCents: 120000,
    priceUnit: "fixed",
    availability: "available",
    availabilityDate: "Sat, 24 Aug 2024",
    tags: ["Floral Design", "Venue Styling", "Table Décor", "Installations", "Sustainability", "Lighting Accents"],
    description:
      "We are a full-service event design and production company creating unforgettable experiences for corporate, luxury, and private clients. From concept to execution, our team delivers elegance, precision, and creativity in every detail.",
    eventsDelivered: 250,
    yearsOnPlatform: 5,
    founded: 2016,
    companySize: "25-50",
    website: "floralcoevents.com",
    aboutBullets: [
      "Bespoke event design",
      "End-to-end production",
      "Floral, décor & styling",
      "AV & lighting integration",
      "On-site management",
    ],
    servicesOffered: [
      { label: "Event Design", icon: "layout" },
      { label: "Production", icon: "sliders" },
      { label: "Floral & Décor", icon: "flower" },
      { label: "AV & Lighting", icon: "sun" },
      { label: "On-site Management", icon: "check-circle" },
      { label: "Logistics & Operations", icon: "message-square" },
    ],
    eventTypes: ["Corporate Events", "Gala Dinners", "Product Launches", "Conferences", "Weddings", "Private Parties", "Award Ceremonies"],
    portfolio: [
      "linear-gradient(135deg,#3a2418,#6b4226)",
      "linear-gradient(135deg,#1a1030,#3d2a63)",
      "linear-gradient(135deg,#2b1f14,#5c4326)",
      "linear-gradient(135deg,#1c1638,#4a3670)",
    ],
    certifications: [
      { label: "ISO 20121", sub: "Sustainable Events" },
      { label: "ISO 9001", sub: "Quality Management" },
      { label: "Health & Safety", sub: "HSE Compliant" },
      { label: "Public Liability", sub: "£10M Coverage" },
    ],
    ratingBreakdown: [
      { label: "Quality", value: 4.9 },
      { label: "Communication", value: 4.9 },
      { label: "Reliability", value: 4.8 },
      { label: "Value", value: 4.7 },
      { label: "Professionalism", value: 4.9 },
    ],
    reviews: [
      { author: "The Riverfront Hotel", company: "London, UK", rating: 5.0, text: "Floral & Co. delivered beyond expectations. Every detail was flawless.", when: "2 weeks ago" },
      { author: "TechCorp Global", company: "London, UK", rating: 4.9, text: "Exceptional creativity and professionalism. Our event was a huge success.", when: "1 month ago" },
      { author: "Luxury Brands Group", company: "Paris, France", rating: 5.0, text: "A true partner. The team is incredibly responsive and talented.", when: "6 weeks ago" },
    ],
    packages: [
      { id: "essential", tier: "Essential", priceFromCents: 120000, unit: "per event", includes: ["Table centrepieces", "Entrance florals", "Setup & breakdown"] },
      { id: "professional", tier: "Professional", popular: true, priceFromCents: 280000, unit: "per event", includes: ["Full venue styling", "Feature installations", "Bespoke floral design", "On-site stylist"] },
      { id: "premium", tier: "Premium", priceFromCents: 520000, unit: "per event", includes: ["Signature installations", "Full production integration", "Dedicated design lead", "Post-event teardown"] },
    ],
    included: ["Pre-event consultation", "Design mock-up", "On-site setup & breakdown", "Sustainability reporting"],
    serviceAreaNote: { primary: "London", secondary: "UK Wide", global: "Upon request" },
  },
  {
    id: "sup-lumiere",
    slug: "lumiere-productions",
    serviceId: "svc-av-production",
    serviceSlug: "premium-av-production-package",
    name: "Lumière Productions",
    serviceName: "Premium AV Production Package",
    category: "AV & Production",
    logoInitial: "LUMIÈRE",
    logoTone: "navy",
    coverImage: "linear-gradient(135deg,#120a24,#2c1653,#5a2b8c)",
    verified: true,
    location: "UK Wide",
    coverage: "UK Wide & Europe",
    responseRate: 96,
    responseTime: "1h",
    rating: 4.8,
    reviewCount: 178,
    leadTime: "3-14 days",
    complianceGrade: "A",
    priceFromCents: 350000,
    priceUnit: "fixed",
    availability: "available",
    tags: ["Sound", "Lighting", "Staging", "Video Production", "Technical Support"],
    description:
      "A full-service AV production solution delivering exceptional sound, lighting, video, and staging for corporate events, conferences, and galas.",
    eventsDelivered: 500,
    yearsOnPlatform: 5,
    founded: 2018,
    companySize: "50-100",
    website: "lumiereproductions.co.uk",
    aboutBullets: ["Industry-leading equipment", "Experienced technical team", "24/7 technical support", "Fully insured & compliant"],
    servicesOffered: [
      { label: "Sound Design", icon: "sliders" },
      { label: "Lighting Design", icon: "sun" },
      { label: "Staging", icon: "layout" },
      { label: "Live Streaming", icon: "video" },
    ],
    eventTypes: ["Corporate Events", "Conferences", "Gala Dinners", "Product Launches", "Hybrid & Virtual Events"],
    portfolio: [
      "linear-gradient(135deg,#120a24,#2c1653)",
      "linear-gradient(135deg,#1c0f38,#4b1f7a)",
      "linear-gradient(135deg,#0d0a1c,#3a1e63)",
      "linear-gradient(135deg,#150c2a,#57258f)",
    ],
    certifications: [
      { label: "PAT Testing", sub: "Valid to Dec 2024" },
      { label: "Public Liability", sub: "£10M Coverage" },
    ],
    ratingBreakdown: [
      { label: "Quality", value: 4.8 },
      { label: "Communication", value: 4.9 },
      { label: "Reliability", value: 4.8 },
      { label: "Value", value: 4.6 },
      { label: "Professionalism", value: 4.9 },
    ],
    reviews: [
      { author: "Grand Victoria Hall", company: "Manchester, UK", rating: 4.9, text: "Seamless production from load-in to strike. Highly recommend.", when: "3 weeks ago" },
    ],
    packages: [
      { id: "essential", tier: "Essential", priceFromCents: 350000, unit: "per event", includes: ["Basic sound system", "LED uplighting", "2x wireless microphones"] },
      { id: "professional", tier: "Professional", popular: true, priceFromCents: 750000, unit: "per event", includes: ["Premium sound system", "Intelligent lighting design", "4x wireless microphones"] },
      { id: "premium", tier: "Premium", priceFromCents: 1500000, unit: "per event", includes: ["Line array sound system", "Moving head lighting", "6x wireless microphones"] },
    ],
    included: ["Pre-event consultation", "Technical planning", "On-site technical support", "Equipment setup & teardown"],
    serviceAreaNote: { primary: "UK Wide", secondary: "Europe (Request)", global: "On enquiry" },
  },
  {
    id: "sup-taste",
    slug: "taste-catering",
    serviceId: "svc-taste-catering",
    serviceSlug: "signature-catering-package",
    name: "Taste Catering",
    serviceName: "Signature Catering Package",
    category: "Catering",
    logoInitial: "TASTE",
    logoTone: "dark",
    coverImage: "linear-gradient(135deg,#2b1a0e,#4a2c14,#7a4a1e)",
    verified: true,
    location: "UK Wide",
    coverage: "UK Wide",
    responseRate: 97,
    responseTime: "2h",
    rating: 4.7,
    reviewCount: 213,
    leadTime: "5-10 days",
    complianceGrade: "A",
    priceFromCents: 2500,
    priceUnit: "per_head",
    availability: "available",
    tags: ["Fine Dining", "Canapés", "Bar Service", "Dietary Options"],
    description: "Award-winning event catering with sustainable, seasonal menus for corporate and private events.",
    eventsDelivered: 400,
    yearsOnPlatform: 4,
    founded: 2019,
    companySize: "25-50",
    website: "tastecatering.co.uk",
    aboutBullets: ["Seasonal, sustainable menus", "Full bar & drinks service", "Dietary & allergen led", "In-house event chefs"],
    servicesOffered: [
      { label: "Fine Dining", icon: "layout" },
      { label: "Canapés", icon: "flower" },
      { label: "Bar Service", icon: "sliders" },
    ],
    eventTypes: ["Gala Dinners", "Weddings", "Corporate Events", "Private Parties"],
    portfolio: [
      "linear-gradient(135deg,#2b1a0e,#4a2c14)",
      "linear-gradient(135deg,#1e130a,#3a2410)",
    ],
    certifications: [{ label: "Food Hygiene", sub: "Level 5 Rated" }],
    ratingBreakdown: [
      { label: "Quality", value: 4.7 },
      { label: "Communication", value: 4.8 },
      { label: "Reliability", value: 4.7 },
      { label: "Value", value: 4.6 },
      { label: "Professionalism", value: 4.8 },
    ],
    reviews: [],
    packages: [
      { id: "essential", tier: "Essential", priceFromCents: 2500, unit: "per head", includes: ["3-course plated menu", "Water & soft drinks"] },
      { id: "professional", tier: "Professional", popular: true, priceFromCents: 4500, unit: "per head", includes: ["5-course tasting menu", "Wine pairing", "Canapé reception"] },
      { id: "premium", tier: "Premium", priceFromCents: 7500, unit: "per head", includes: ["Bespoke tasting menu", "Full bar service", "Dedicated event chef"] },
    ],
    included: ["Menu tasting session", "Full waitstaff", "Setup & clearing"],
    serviceAreaNote: { primary: "UK Wide", secondary: "Europe (Request)", global: "On enquiry" },
  },
  {
    id: "sup-spark",
    slug: "spark-events",
    serviceId: "svc-spark-staffing",
    serviceSlug: "event-staffing-package",
    name: "Spark Events",
    serviceName: "Event Staffing Package",
    category: "Staffing",
    logoInitial: "SPARK",
    logoTone: "navy",
    coverImage: "linear-gradient(135deg,#0e1a1c,#143a3d,#1e5a5e)",
    verified: false,
    location: "UK Wide",
    coverage: "UK Wide",
    responseRate: 95,
    responseTime: "1h",
    rating: 4.8,
    reviewCount: 142,
    leadTime: "1-7 days",
    complianceGrade: "A",
    priceFromCents: 18000,
    priceUnit: "per_staff",
    availability: "limited",
    tags: ["Event Staff", "Hosts", "Security Escorts"],
    description: "Professional, reliable event staff for seamless event delivery.",
    eventsDelivered: 600,
    yearsOnPlatform: 3,
    founded: 2021,
    companySize: "100+",
    website: "sparkevents.co.uk",
    aboutBullets: ["Vetted, uniformed staff", "Nationwide coverage", "Flexible booking windows"],
    servicesOffered: [{ label: "Front of House", icon: "check-circle" }, { label: "Hospitality Staff", icon: "layout" }],
    eventTypes: ["Corporate Events", "Conferences", "Product Launches"],
    portfolio: ["linear-gradient(135deg,#0e1a1c,#143a3d)"],
    certifications: [{ label: "DBS Checked", sub: "All Staff" }],
    ratingBreakdown: [
      { label: "Quality", value: 4.7 },
      { label: "Communication", value: 4.8 },
      { label: "Reliability", value: 4.9 },
      { label: "Value", value: 4.8 },
      { label: "Professionalism", value: 4.8 },
    ],
    reviews: [],
    packages: [
      { id: "essential", tier: "Essential", priceFromCents: 18000, unit: "per staff / day", includes: ["Uniformed host", "8hr shift"] },
    ],
    included: ["Uniform provided", "DBS-checked staff"],
    serviceAreaNote: { primary: "UK Wide", secondary: "—", global: "—" },
  },
  {
    id: "sup-premier",
    slug: "premier-event-staff",
    serviceId: "svc-premier-staffing",
    serviceSlug: "premium-staffing-package",
    name: "Premier Event Staff",
    serviceName: "Premium Staffing Package",
    category: "Staffing",
    logoInitial: "PREMIER",
    logoTone: "dark",
    coverImage: "linear-gradient(135deg,#1a1a1a,#2e2e2e,#454545)",
    verified: true,
    location: "London, UK",
    coverage: "UK Wide",
    responseRate: 96,
    responseTime: "<1h",
    rating: 4.8,
    reviewCount: 142,
    leadTime: "2-7 days",
    complianceGrade: "A",
    priceFromCents: 18000,
    priceUnit: "per_staff",
    availability: "available",
    tags: ["Waitstaff", "Bar Staff", "Event Managers"],
    description: "Professional, reliable event staff for seamless event delivery.",
    eventsDelivered: 350,
    yearsOnPlatform: 6,
    founded: 2015,
    companySize: "50-100",
    website: "premiereventstaff.co.uk",
    aboutBullets: ["Fully trained staff", "Nationwide coverage", "Dedicated event managers"],
    servicesOffered: [{ label: "Waitstaff", icon: "layout" }, { label: "Bar Staff", icon: "sliders" }],
    eventTypes: ["Gala Dinners", "Weddings", "Corporate Events"],
    portfolio: ["linear-gradient(135deg,#1a1a1a,#2e2e2e)"],
    certifications: [{ label: "DBS Checked", sub: "All Staff" }],
    ratingBreakdown: [
      { label: "Quality", value: 4.8 },
      { label: "Communication", value: 4.8 },
      { label: "Reliability", value: 4.9 },
      { label: "Value", value: 4.7 },
      { label: "Professionalism", value: 4.9 },
    ],
    reviews: [],
    packages: [{ id: "essential", tier: "Essential", priceFromCents: 18000, unit: "per staff / day", includes: ["Trained waitstaff", "8hr shift"] }],
    included: ["Uniform provided", "Dedicated shift lead"],
    serviceAreaNote: { primary: "London", secondary: "UK Wide", global: "—" },
  },
  {
    id: "sup-illuminate",
    slug: "illuminate-lighting",
    serviceId: "svc-illuminate-lighting",
    serviceSlug: "event-lighting-package",
    name: "Illuminate Lighting",
    serviceName: "Event Lighting Package",
    category: "Lighting",
    logoInitial: "ILLUMINATE",
    logoTone: "violet",
    coverImage: "linear-gradient(135deg,#1c1030,#3d1e63,#7c3ae0)",
    verified: false,
    location: "UK Wide",
    coverage: "UK Wide",
    responseRate: 94,
    responseTime: "3h",
    rating: 4.6,
    reviewCount: 88,
    leadTime: "3-10 days",
    complianceGrade: "B",
    priceFromCents: 90000,
    priceUnit: "fixed",
    availability: "available",
    tags: ["Uplighting", "Rigging", "Dance Floor Lighting"],
    description: "Bespoke lighting design that transforms venues for every kind of event.",
    eventsDelivered: 220,
    yearsOnPlatform: 2,
    founded: 2022,
    companySize: "10-25",
    website: "illuminatelighting.co.uk",
    aboutBullets: ["Custom lighting design", "In-house rigging team"],
    servicesOffered: [{ label: "Lighting Design", icon: "sun" }],
    eventTypes: ["Weddings", "Corporate Events"],
    portfolio: ["linear-gradient(135deg,#1c1030,#3d1e63)"],
    certifications: [{ label: "PAT Testing", sub: "Valid to Nov 2024" }],
    ratingBreakdown: [
      { label: "Quality", value: 4.6 },
      { label: "Communication", value: 4.5 },
      { label: "Reliability", value: 4.6 },
      { label: "Value", value: 4.7 },
      { label: "Professionalism", value: 4.6 },
    ],
    reviews: [],
    packages: [{ id: "essential", tier: "Essential", priceFromCents: 90000, unit: "per event", includes: ["LED uplighting", "Setup & breakdown"] }],
    included: ["Setup & breakdown"],
    serviceAreaNote: { primary: "UK Wide", secondary: "—", global: "—" },
  },
  {
    id: "sup-pristine",
    slug: "pristine-clean",
    serviceId: "svc-pristine-clean",
    serviceSlug: "event-cleaning-package",
    name: "Pristine Clean Ltd",
    serviceName: "Event Cleaning Package",
    category: "Cleaning",
    logoInitial: "PRISTINE",
    logoTone: "navy",
    coverImage: "linear-gradient(135deg,#0e1420,#1e2c40,#33506e)",
    verified: true,
    location: "UK Wide",
    coverage: "UK Wide",
    responseRate: 93,
    responseTime: "2h",
    rating: 4.7,
    reviewCount: 64,
    leadTime: "1-5 days",
    complianceGrade: "A",
    priceFromCents: 30000,
    priceUnit: "fixed",
    availability: "available",
    tags: ["Post-Event Clean", "Deep Clean", "Waste Removal"],
    description: "Reliable pre and post-event cleaning teams for venues of every size.",
    eventsDelivered: 500,
    yearsOnPlatform: 4,
    founded: 2020,
    companySize: "25-50",
    website: "pristineclean.co.uk",
    aboutBullets: ["COSHH compliant", "Rapid turnaround teams"],
    servicesOffered: [{ label: "Deep Clean", icon: "check-circle" }],
    eventTypes: ["Corporate Events", "Conferences"],
    portfolio: ["linear-gradient(135deg,#0e1420,#1e2c40)"],
    certifications: [{ label: "COSHH", sub: "Certified" }],
    ratingBreakdown: [
      { label: "Quality", value: 4.7 },
      { label: "Communication", value: 4.6 },
      { label: "Reliability", value: 4.8 },
      { label: "Value", value: 4.8 },
      { label: "Professionalism", value: 4.7 },
    ],
    reviews: [],
    packages: [{ id: "essential", tier: "Essential", priceFromCents: 30000, unit: "per event", includes: ["Post-event deep clean", "Waste removal"] }],
    included: ["Waste removal"],
    serviceAreaNote: { primary: "UK Wide", secondary: "—", global: "—" },
  },
  {
    id: "sup-guardian",
    slug: "guardian-security",
    serviceId: "svc-guardian-security",
    serviceSlug: "event-security-package",
    name: "Guardian Security",
    serviceName: "Event Security Package",
    category: "Security",
    logoInitial: "GUARDIAN",
    logoTone: "dark",
    coverImage: "linear-gradient(135deg,#160e14,#2c1c26,#4a2c3c)",
    verified: true,
    location: "UK Wide",
    coverage: "UK Wide",
    responseRate: 97,
    responseTime: "<1h",
    rating: 4.7,
    reviewCount: 120,
    leadTime: "3-10 days",
    complianceGrade: "A",
    priceFromCents: 22000,
    priceUnit: "per_staff",
    availability: "available",
    tags: ["SIA Licensed", "Door Supervisors", "Close Protection"],
    description: "SIA-licensed security professionals for events of every scale.",
    eventsDelivered: 300,
    yearsOnPlatform: 5,
    founded: 2017,
    companySize: "50-100",
    website: "guardiansecurity.co.uk",
    aboutBullets: ["SIA licensed", "24/7 dispatch"],
    servicesOffered: [{ label: "Door Supervision", icon: "check-circle" }],
    eventTypes: ["Corporate Events", "Gala Dinners"],
    portfolio: ["linear-gradient(135deg,#160e14,#2c1c26)"],
    certifications: [{ label: "SIA Licensed", sub: "All Staff" }],
    ratingBreakdown: [
      { label: "Quality", value: 4.7 },
      { label: "Communication", value: 4.7 },
      { label: "Reliability", value: 4.9 },
      { label: "Value", value: 4.6 },
      { label: "Professionalism", value: 4.8 },
    ],
    reviews: [],
    packages: [{ id: "essential", tier: "Essential", priceFromCents: 22000, unit: "per staff / day", includes: ["SIA door supervisor", "8hr shift"] }],
    included: ["SIA badge checked on arrival"],
    serviceAreaNote: { primary: "UK Wide", secondary: "—", global: "—" },
  },
  {
    id: "sup-rhythm",
    slug: "rhythm-entertainment",
    serviceId: "svc-rhythm-entertainment",
    serviceSlug: "live-entertainment-package",
    name: "Rhythm Entertainment",
    serviceName: "Live Entertainment Package",
    category: "Entertainment",
    logoInitial: "RHYTHM",
    logoTone: "violet",
    coverImage: "linear-gradient(135deg,#1a0e2e,#3d1e5e,#6c2ba0)",
    verified: true,
    location: "UK Wide",
    coverage: "UK Wide",
    responseRate: 95,
    responseTime: "1h",
    rating: 4.8,
    reviewCount: 96,
    leadTime: "7-21 days",
    complianceGrade: "A",
    priceFromCents: 180000,
    priceUnit: "fixed",
    availability: "available",
    tags: ["Live Band", "DJ", "MC Hosting"],
    description: "Live bands, DJs and hosts that set the tone for unforgettable events.",
    eventsDelivered: 180,
    yearsOnPlatform: 3,
    founded: 2020,
    companySize: "10-25",
    website: "rhythmentertainment.co.uk",
    aboutBullets: ["Curated artist roster", "Full sound & lighting rider support"],
    servicesOffered: [{ label: "Live Band", icon: "music" }, { label: "DJ", icon: "music" }],
    eventTypes: ["Weddings", "Gala Dinners", "Corporate Events"],
    portfolio: ["linear-gradient(135deg,#1a0e2e,#3d1e5e)"],
    certifications: [{ label: "PAT Testing", sub: "Valid to Jan 2025" }],
    ratingBreakdown: [
      { label: "Quality", value: 4.8 },
      { label: "Communication", value: 4.8 },
      { label: "Reliability", value: 4.8 },
      { label: "Value", value: 4.7 },
      { label: "Professionalism", value: 4.9 },
    ],
    reviews: [],
    packages: [{ id: "essential", tier: "Essential", priceFromCents: 180000, unit: "per event", includes: ["4-piece live band", "3hr set"] }],
    included: ["Sound check", "Standard PA system"],
    serviceAreaNote: { primary: "UK Wide", secondary: "—", global: "—" },
  },
];

export const VENUES: VenueListing[] = [
  {
    id: "ven-riverfront",
    slug: "the-riverfront-hotel",
    name: "The Riverfront Hotel",
    type: "Hotel",
    images: [
      "linear-gradient(135deg,#0c1830,#1e3a5c,#3a6a8c)",
      "linear-gradient(135deg,#2a1810,#4a3020)",
      "linear-gradient(135deg,#1a2438,#2c3c54)",
      "linear-gradient(135deg,#241830,#3c2848)",
    ],
    verified: true,
    featured: true,
    location: "London, UK",
    address: "20 Riverbank Promenade, London SE1 8QY, UK",
    seatedCapacity: 500,
    standingCapacity: 800,
    availability: "available",
    availabilityDate: "Sat, 24 Aug 2024",
    priceFromCents: 1850000,
    responseTime: "2h",
    rating: 4.8,
    reviewCount: 124,
    amenities: ["Wi-Fi", "Parking", "Catering", "AV", "Accommodation", "Cloakroom", "Air conditioning", "In-house AV", "Stage & lighting"],
    highlights: [
      "Riverside location with stunning city views",
      "Flexible event spaces for 50 – 800 guests",
      "In-house AV & production support",
      "Award-winning catering & hospitality",
    ],
    accessible: true,
    description:
      "A striking riverside venue combining glass-walled event spaces with panoramic city views, purpose-built for galas, conferences and product launches.",
    spaces: [
      { name: "Grand Hall", seated: 500, standing: 800, priceFromCents: 1850000 },
      { name: "Riverside Terrace", seated: 150, standing: 250, priceFromCents: 650000 },
      { name: "Boardroom Suite", seated: 40, standing: 60, priceFromCents: 220000 },
    ],
    ownerId: "own-floral-co",
    hostedEvents: [
      "linear-gradient(135deg,#1a1030,#3d2a63)",
      "linear-gradient(135deg,#241830,#4a2c52)",
      "linear-gradient(135deg,#0e1830,#2c3c60)",
    ],
    documents: [
      { label: "Venue Hire Terms", size: "245 KB" },
      { label: "Catering Policy", size: "189 KB" },
      { label: "Technical Specification", size: "312 KB" },
      { label: "Accessibility Guide", size: "156 KB" },
    ],
  },
  {
    id: "ven-victoria",
    slug: "grand-victoria-hall",
    name: "Grand Victoria Hall",
    type: "Historic Venue",
    images: [
      "linear-gradient(135deg,#2c1c10,#4a3018,#6c4a24)",
      "linear-gradient(135deg,#1a1410,#3a2c1c)",
      "linear-gradient(135deg,#241a10,#4a341c)",
      "linear-gradient(135deg,#181410,#302418)",
    ],
    verified: true,
    location: "Manchester, UK",
    address: "Victoria Street, Manchester M3 1AJ, UK",
    seatedCapacity: 1200,
    standingCapacity: 1800,
    availability: "available",
    availabilityDate: "Fri, 23 Aug 2024",
    priceFromCents: 2200000,
    responseTime: "1h",
    rating: 4.9,
    reviewCount: 256,
    amenities: ["Air conditioning", "Wi-Fi", "Disabled access", "Lift access", "Stage & lighting", "Cloakroom", "In-house AV"],
    highlights: ["Grade II listed", "High ceilings", "Historic architecture", "Modern facilities", "Dedicated events team", "In-house AV"],
    accessible: true,
    description:
      "Built in 1887, Grand Victoria Hall is one of Manchester's most iconic venues. With its sweeping architecture, ornate detailing and state-of-the-art production facilities, it provides a stunning backdrop for unforgettable events.",
    spaces: [
      { name: "Main Hall", seated: 1200, standing: 1800, priceFromCents: 2200000 },
      { name: "Concert Hall", seated: 800, standing: 1100, priceFromCents: 1800000 },
      { name: "Banqueting Suite", seated: 300, standing: 450, priceFromCents: 850000 },
      { name: "Conference Room", seated: 120, standing: 160, priceFromCents: 400000 },
    ],
    ownerId: "own-floral-co",
    hostedEvents: [
      "linear-gradient(135deg,#1a1030,#3d2a63)",
      "linear-gradient(135deg,#241830,#4a2c52)",
      "linear-gradient(135deg,#0e1830,#2c3c60)",
      "linear-gradient(135deg,#2c1030,#5c2a63)",
    ],
    documents: [
      { label: "Venue Hire Terms", size: "245 KB" },
      { label: "Catering Policy", size: "189 KB" },
      { label: "Technical Specification", size: "312 KB" },
      { label: "Accessibility Guide", size: "156 KB" },
    ],
  },
  {
    id: "ven-skyline",
    slug: "skyline-terrace",
    name: "Skyline Terrace",
    type: "Rooftop",
    images: [
      "linear-gradient(135deg,#0c1c30,#1e3c5c,#e08a3c)",
      "linear-gradient(135deg,#1a1024,#3d2050)",
    ],
    verified: false,
    location: "Birmingham, UK",
    address: "1 Skyline Way, Birmingham B1 1AA, UK",
    seatedCapacity: 200,
    standingCapacity: 300,
    availability: "available",
    availabilityDate: "Sat, 24 Aug 2024",
    priceFromCents: 780000,
    responseTime: "3h",
    rating: 4.6,
    reviewCount: 58,
    amenities: ["Wi-Fi", "Bar", "Outdoor space", "Heating"],
    highlights: ["Panoramic skyline views", "Open-air terrace", "In-house bar"],
    accessible: true,
    description: "A striking rooftop venue with panoramic city views, ideal for receptions and summer events.",
    spaces: [{ name: "Terrace", seated: 200, standing: 300, priceFromCents: 780000 }],
    ownerId: "own-floral-co",
    hostedEvents: [],
    documents: [{ label: "Venue Hire Terms", size: "198 KB" }],
  },
  {
    id: "ven-capital",
    slug: "the-capital-conference-centre",
    name: "The Capital Conference Centre",
    type: "Conference Centre",
    images: [
      "linear-gradient(135deg,#241830,#3c2848,#5a3c6c)",
      "linear-gradient(135deg,#1a1424,#302040)",
    ],
    verified: true,
    featured: true,
    location: "Edinburgh, UK",
    address: "12 Capital Square, Edinburgh EH1 2AB, UK",
    seatedCapacity: 800,
    standingCapacity: 1000,
    availability: "available",
    availabilityDate: "Mon, 26 Aug 2024",
    priceFromCents: 1290000,
    responseTime: "2h",
    rating: 4.8,
    reviewCount: 142,
    amenities: ["Wi-Fi", "Parking", "Catering", "AV", "Breakout rooms"],
    highlights: ["State-of-the-art AV", "Flexible breakout spaces", "Dedicated events team"],
    accessible: true,
    description: "A modern, flexible conference centre in the heart of Edinburgh built for large-scale corporate events.",
    spaces: [{ name: "Main Auditorium", seated: 800, standing: 1000, priceFromCents: 1290000 }],
    ownerId: "own-floral-co",
    hostedEvents: [],
    documents: [{ label: "Venue Hire Terms", size: "210 KB" }],
  },
];

export const VENUE_OWNERS: VenueOwner[] = [
  {
    id: "own-floral-co",
    slug: "floral-co-events-operator",
    name: "Floral & Co. Events",
    logoInitial: "FLORAL & CO.",
    tagline: "Premium Event Venue Operator",
    location: "London, UK",
    companyReg: "08451236",
    founded: 2012,
    rating: 4.9,
    reviewCount: 256,
    responseRate: 98,
    responseTime: "1h",
    acceptedBookingRate: 87,
    venueIds: ["ven-victoria", "ven-riverfront", "ven-skyline", "ven-capital"],
    about:
      "Floral & Co. Events is a premium venue operator specializing in extraordinary spaces for corporate and private events. From historic landmarks to modern architectural gems, we create unforgettable experiences across the UK and Europe.",
    preferredEventTypes: ["Corporate Events", "Conferences", "Gala Dinners", "Weddings", "Product Launches", "Award Ceremonies"],
    operationalRegions: [{ region: "London", count: 12 }],
    accountManager: {
      name: "Jessica Taylor",
      role: "Senior Account Manager",
      email: "jessica.taylor@floralco.events",
      phone: "+44 20 7946 0958",
    },
    trust: [
      { label: "Verified Partner", sub: "Identity & business verified" },
      { label: "Insurance Verified", sub: "£10M public liability" },
      { label: "GDPR Compliant", sub: "Data protection certified" },
      { label: "Health & Safety", sub: "HSE compliant" },
    ],
    recentEvents: [
      { name: "Annual Leadership Summit 2024", venue: "Grand Victoria Hall, Manchester", guests: 450, status: "Completed" },
      { name: "Product Launch Event", venue: "Lumière Productions, London", guests: 300, status: "Completed" },
    ],
  },
];

export function findSupplierBySlug(slug: string) {
  return SUPPLIERS.find((s) => s.slug === slug);
}
export function findSupplierByServiceSlug(slug: string) {
  return SUPPLIERS.find((s) => s.serviceSlug === slug);
}
export function findVenueBySlug(slug: string) {
  return VENUES.find((v) => v.slug === slug);
}
export function findVenueOwnerBySlug(slug: string) {
  return VENUE_OWNERS.find((o) => o.slug === slug);
}
export function venuesForOwner(ownerId: string) {
  return VENUES.filter((v) => v.ownerId === ownerId);
}

export const RECENTLY_VIEWED_VENUES = [VENUES[1], VENUES[2]];
export const RECENTLY_VIEWED_SUPPLIERS = [SUPPLIERS[2]];
export const SHORTLIST_ITEMS = [
  { id: VENUES[0].id, kind: "venue" as const, name: VENUES[0].name, sub: VENUES[0].location },
  { id: SUPPLIERS[0].id, kind: "supplier" as const, name: SUPPLIERS[0].name, sub: SUPPLIERS[0].location },
  { id: SUPPLIERS[2].id, kind: "supplier" as const, name: SUPPLIERS[2].name, sub: SUPPLIERS[2].coverage },
  { id: SUPPLIERS[3].id, kind: "supplier" as const, name: SUPPLIERS[3].name, sub: SUPPLIERS[3].coverage },
];
