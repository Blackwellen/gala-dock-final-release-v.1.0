import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CircleAlert,
  ClipboardCheck,
  HeartHandshake,
  MonitorPlay,
  Music2,
  Plane,
  Sparkles,
  Trophy,
  UtensilsCrossed,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

export type EventExtension = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  areas: readonly string[];
  setupSteps: readonly string[];
  relatedTabs: readonly string[];
  plannedGate: string;
};

export const EVENT_EXTENSIONS: readonly EventExtension[] = [
  {
    id: "corporate",
    title: "Corporate programmes",
    description: "Cost centres, approvals, delegates, executive handling and portfolio reporting for internal programmes.",
    icon: Building2,
    areas: ["Department and cost-centre budgets", "Purchase orders and approval chains", "Delegate groups and confidential events"],
    setupSteps: ["Choose a corporate template", "Assign cost centre and approvers", "Define delegates and event objectives"],
    relatedTabs: ["Finance", "Guests", "Insights"],
    plannedGate: "Enterprise · corporateProgrammes",
  },
  {
    id: "virtual-delivery",
    title: "Virtual & hybrid delivery",
    description: "Plan streaming rooms, speaker readiness, live engagement, recordings and replay access alongside the physical event.",
    icon: MonitorPlay,
    areas: ["Main stage, breakouts and green rooms", "Speaker checks, rehearsal and presentation control", "Captions, engagement and recording permissions"],
    setupSteps: ["Select delivery mode and provider", "Create virtual rooms and sessions", "Schedule technical rehearsal and moderation"],
    relatedTabs: ["Schedule", "Guests", "Documents & Media"],
    plannedGate: "Scale · hybridEvents",
  },
  {
    id: "hospitality",
    title: "Hospitality & catering",
    description: "Coordinate menus, dietary requirements, covers, service timing, kitchen operations and bar plans.",
    icon: UtensilsCrossed,
    areas: ["Menu, tasting and dietary management", "Kitchen and front-of-house service plans", "Bar packages, stock and concessions"],
    setupSteps: ["Choose caterer and service style", "Collect selections and dietary requirements", "Publish kitchen and service timeline"],
    relatedTabs: ["Guests", "Suppliers", "Finance"],
    plannedGate: "Growth/Scale · cateringOps",
  },
  {
    id: "fundraising",
    title: "Fundraising",
    description: "Create a safe operational home for targets, donations, auction lots, pledges, donor recognition and charity reporting.",
    icon: HeartHandshake,
    areas: ["Targets, donations and peer-to-peer pages", "Auction, pledge and raffle operations", "Gift Aid, volunteer and impact reporting"],
    setupSteps: ["Confirm charity and finance configuration", "Set target and contribution options", "Configure auction and donor recognition"],
    relatedTabs: ["Finance", "Guests", "Publish"],
    plannedGate: "Scale · fundraising",
  },
  {
    id: "celebration",
    title: "Weddings & celebrations",
    description: "Manage couple roles, households, related occasions, ceremony/reception plans and a private collaboration portal.",
    icon: Sparkles,
    areas: ["Couple portal and wedding-party roles", "Households, plus-ones and invitations", "Ceremony, reception, rehearsal and day-of coordination"],
    setupSteps: ["Create celebration and related events", "Invite couple and wedding-party roles", "Set guest, ceremony and reception requirements"],
    relatedTabs: ["Guests", "Mood Board", "Logistics"],
    plannedGate: "Growth · celebrations",
  },
  {
    id: "conference",
    title: "Conference & exhibition",
    description: "Run multi-track programmes, speakers, abstracts, exhibitors, sponsors, appointments and accredited attendance.",
    icon: UsersRound,
    areas: ["Tracks, sessions, rooms and speakers", "Exhibitors, stands and sponsor deliverables", "Networking, lead capture and continuing education"],
    setupSteps: ["Create tracks and session rooms", "Open speaker and exhibitor workflows", "Configure sponsor and delegate experience"],
    relatedTabs: ["Schedule", "Guests", "Floor Plan & Seating"],
    plannedGate: "Scale · conferenceOps",
  },
  {
    id: "festival-production",
    title: "Festival & live production",
    description: "Bring artist, rider, stage, crowd, site, concession and settlement operations into the event command centre.",
    icon: Music2,
    areas: ["Artist offers, riders, stage plots and sound checks", "Zones, capacity, weather, entrances and security", "Concessions, merchandise, settlements and royalties"],
    setupSteps: ["Build artist and stage schedule", "Set site zones, capacity and safety controls", "Prepare concession and settlement workflow"],
    relatedTabs: ["Schedule", "Suppliers", "Event Map"],
    plannedGate: "Scale · liveEntertainment",
  },
  {
    id: "competition",
    title: "Sports & participation",
    description: "Structure registrations, teams, fixtures, timing, results, waivers, routes and on-course safety.",
    icon: Trophy,
    areas: ["Participants, teams, divisions and fixtures", "Heats, timing, results and awards", "Routes, checkpoints, medical and water stations"],
    setupSteps: ["Choose competition format", "Open participant registration and waivers", "Define fixtures, timing and results publishing"],
    relatedTabs: ["Guests", "Event Map", "Risk & Control"],
    plannedGate: "Scale · sportsEvents",
  },
  {
    id: "travel-accommodation",
    title: "Travel & accommodation",
    description: "Coordinate room blocks, traveller itineraries, transfers, manifests, destination guidance and emergency contacts.",
    icon: Plane,
    areas: ["Accommodation blocks and allocations", "Flights, rail, transfers and arrival tracking", "Destination, visa and emergency information"],
    setupSteps: ["Create room blocks and transport plan", "Assign travellers and arrival requirements", "Publish itinerary and emergency guidance"],
    relatedTabs: ["Guests", "Logistics", "Documents & Media"],
    plannedGate: "Enterprise · travelOps",
  },
  {
    id: "risk-control",
    title: "Risk & event control",
    description: "Provide a controlled place for risk assessments, permits, incident logs, capacity, safety deployments and live event control.",
    icon: CircleAlert,
    areas: ["Risk assessments, controls and method statements", "Permits, insurance, capacity and emergency planning", "Incident, security and medical control-room activity"],
    setupSteps: ["Create risk assessment and owners", "Attach permits and emergency plan", "Prepare event-day control roster"],
    relatedTabs: ["Event Day", "Documents & Media", "Activity"],
    plannedGate: "Scale · eventControl",
  },
  {
    id: "marketing",
    title: "Marketing & audience growth",
    description: "Plan event-specific registration campaigns, referrals, ambassador links, waitlists, announcements and post-event highlights.",
    icon: ClipboardCheck,
    areas: ["Registration campaigns, referral and discount links", "Waitlists, reminders and announcements", "Press accreditation and Caption Fox handoff"],
    setupSteps: ["Choose campaign objective and audience", "Configure registrations and referral rules", "Prepare announcements and reporting"],
    relatedTabs: ["Publish", "Tickets", "Insights"],
    plannedGate: "Scale · eventMarketing",
  },
] as const;

function getExtension(extensionId: string) {
  return EVENT_EXTENSIONS.find((extension) => extension.id === extensionId);
}

export function EventExtensionsIndex({ eventId }: { eventId: string }) {
  return (
    <div>
      <PageHeader
        title="Event extensions"
        description="Add the operational packs that match this event. Each pack has a dedicated route and setup area before it is enabled for delivery."
      />
      <div className="p-5 sm:p-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {EVENT_EXTENSIONS.map((extension) => {
          const Icon = extension.icon;
          return (
            <Link
              key={extension.id}
              href={`/event-manager/events/${eventId}/${extension.id}`}
              className="group rounded-xl border border-surface-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-brand-50 p-2 text-brand-700"><Icon className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <h2 className="font-semibold text-surface-900">{extension.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-surface-600">{extension.description}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2 text-xs">
                <span className="rounded-full bg-surface-100 px-2.5 py-1 font-medium text-surface-600">{extension.plannedGate}</span>
                <span className="inline-flex items-center gap-1 font-medium text-brand-700">Open shell <ArrowRight className="h-3.5 w-3.5" /></span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function EventExtensionShell({ eventId, extensionId }: { eventId: string; extensionId: string }) {
  const extension = getExtension(extensionId);

  if (!extension) {
    return (
      <div>
        <PageHeader title="Planned event area" description="This route is reserved for a future event extension." />
        <div className="p-6"><p className="rounded-xl border border-dashed border-surface-300 bg-white p-6 text-sm text-surface-600">Choose an extension from the Event extensions directory to see its planned operational shell.</p></div>
      </div>
    );
  }

  const Icon = extension.icon;
  return (
    <div>
      <PageHeader
        title={extension.title}
        description={extension.description}
        actions={<Link href={`/event-manager/events/${eventId}/extensions`} className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50">All extensions</Link>}
      />
      <div className="space-y-5 p-5 sm:p-6">
        <section className="rounded-xl border border-brand-100 bg-brand-50/60 p-5">
          <div className="flex gap-3"><span className="rounded-lg bg-white p-2 text-brand-700 shadow-sm"><Icon className="h-5 w-5" /></span><div><h2 className="font-semibold text-surface-900">Structural shell</h2><p className="mt-1 text-sm text-surface-700">This is the dedicated home for {extension.title.toLowerCase()}. Setup and live controls are intentionally separated so future implementation can add records, permissions and workflows without redesigning navigation.</p></div></div>
        </section>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl border border-surface-200 bg-white p-5"><h2 className="font-semibold text-surface-900">This area will manage</h2><ul className="mt-3 space-y-2 text-sm text-surface-600">{extension.areas.map((area) => <li key={area} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />{area}</li>)}</ul></section>
          <section id="setup" className="rounded-xl border border-surface-200 bg-white p-5"><h2 className="font-semibold text-surface-900">Setup journey</h2><ol className="mt-3 space-y-3 text-sm text-surface-600">{extension.setupSteps.map((step, index) => <li key={step} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-100 text-xs font-semibold text-surface-700">{index + 1}</span>{step}</li>)}</ol></section>
        </div>
        <section className="rounded-xl border border-surface-200 bg-white p-5"><h2 className="font-semibold text-surface-900">Connected event areas</h2><p className="mt-1 text-sm text-surface-600">When this pack is implemented, it will use the existing event context rather than duplicate records.</p><div className="mt-3 flex flex-wrap gap-2">{extension.relatedTabs.map((tab) => <span key={tab} className="rounded-full bg-surface-100 px-3 py-1.5 text-sm font-medium text-surface-700">{tab}</span>)}</div></section>
      </div>
    </div>
  );
}
