29. STRIPE CONNECT ONBOARDING
Use Stripe Connect appropriately.
Never store raw card numbers.
Use Stripe-hosted or supported embedded onboarding where appropriate.
Track:
* connected_account_id;
* onboarding state;
* charges capability;
* transfers capability;
* payouts capability;
* requirements currently due;
* future requirements;
* disabled reason;
* verification state.
Providers unable to satisfy required payment verification must not receive payouts.
Use webhooks as authoritative payment-state updates.
Verify signatures.
Make processing idempotent.
 
⸻
 
30. ID AND BUSINESS VERIFICATION
Use the appropriate combination of:
* Stripe Connect verification;
* Stripe Identity only where justified;
* internal marketplace verification;
* manual review for exceptional cases.
Do not duplicate regulated verification unnecessarily.
Status examples:
* unverified;
* pending;
* verified;
* action_required;
* restricted;
* suspended.
Verification badges must communicate what is actually verified.
Do not imply Gala Dock independently guarantees a provider merely because Stripe completed payment onboarding.
 
⸻
 
31. INSURANCE AND DOCUMENT MANAGEMENT
Provider Profiles require a structured credential system.
Support document categories:
* public liability insurance;
* professional indemnity where relevant;
* employer liability where relevant;
* event insurance;
* licence;
* security licence;
* food hygiene evidence;
* alcohol-related permissions where relevant;
* equipment inspection certificates;
* electrical/PAT documents;
* risk assessments;
* fire-safety documents;
* accessibility information;
* company documents;
* category-specific certification.
Each document records:
* provider;
* category;
* file;
* issuing organisation;
* reference;
* effective date;
* expiry;
* verification method;
* verification state;
* reviewed by;
* review timestamp.
Create expiry reminders.
Marketplace availability can be gated where a required credential is missing or expired.
Rules must be category/jurisdiction configurable.
Do not hard-code UK-only legal assumptions into domain models.
 
⸻
 
32. PROVIDER RELIABILITY
Build structured reliability metrics.
Potential metrics:
* response rate;
* median response time;
* quote response rate;
* confirmed-booking completion rate;
* provider cancellation rate;
* no-show rate;
* on-time arrival;
* dispute rate;
* verified review rating.
Use these carefully.
Do not expose misleading precision.
Reliability should influence:
* ranking;
* Instant Book eligibility;
* emergency eligibility;
* standby eligibility;
* recommended badge.
Maintain auditability of score inputs.
 
⸻
 
33. MARKETPLACE BOOKING STATES
Do not use a single “booking status”.
Model state properly.
Suggested lifecycle:
* draft;
* enquiry_created;
* sent;
* awaiting_provider;
* clarification_requested;
* quote_received;
* quote_revised;
* customer_reviewing;
* conditional_hold_requested;
* conditionally_held;
* standby_offered;
* standby_accepted;
* awaiting_payment;
* awaiting_confirmation;
* confirmed;
* active;
* fulfilled;
* completion_pending;
* completed;
* cancellation_requested;
* cancelled_by_customer;
* cancelled_by_provider;
* replacement_required;
* disputed;
* refunded;
* partially_refunded;
* expired_no_response.
Keep:
Declined
different from:
Expired / No Response
and:
Unavailable
different from both.
 
⸻
 
34. RESPONSE COMMITMENT SYSTEM
Providers configure supported response commitments such as:
* 2 hours;
* 4 hours;
* 8 hours;
* 12 hours;
* up to 24 hours for appropriate venue enquiries.
Emergency requests can have tighter configured windows.
Every request records:
* sent_at;
* due_at;
* response_status;
* responded_at.
UI must display countdown.
Notifications escalate before expiry.
Gala Agent can monitor deadlines.
Failure to respond can affect reliability.
Do not mark a request unavailable merely because a provider has not responded.
 
⸻
 
35. CONDITIONAL HOLDS
A conditional hold is a marketplace availability reservation.
Example:
Caterer can hold Saturday while venue confirmation is pending.
Model:
* resource;
* dependent event;
* dependent booking;
* held inventory/capacity;
* start;
* expiry;
* price if any;
* conditions;
* status.
Important:
Do not equate an internal marketplace hold with a long-duration card authorisation.
Stripe/card authorisation windows are limited and change by payment method/network.
For longer planning periods:
* use marketplace reservation state;
* optionally save an authorised payment method using appropriate Stripe flows;
* collect deposit when appropriate;
* create a fresh PaymentIntent when a charge is actually due.
Do not fake indefinite payment holds.
 
⸻
 
36. PAID STANDBY
Build separate standby functionality.
Standby may apply to:
* DJs;
* photographers;
* entertainers;
* security;
* event staff;
* mobile bars;
* technicians;
* equipment suppliers;
* other qualifying providers.
Standby contains:
* provider;
* primary booking dependency;
* availability commitment;
* activation window;
* standby fee;
* activation price;
* cancellation terms;
* automatic expiry;
* activation state.
Primary fails → Gala Dock can surface standby immediately.
Agent may recommend standby.
Binding standby purchase remains controlled by payment/approval rules.
 
⸻
 
37. EMERGENCY SUPPLY
Organizer Marketplace needs an obvious:
Emergency Supply
workflow.
Categories may include:
* venue;
* DJ;
* security;
* catering;
* photographer;
* videographer;
* entertainment;
* staffing;
* AV;
* staging;
* generator;
* bar;
* transportation;
* equipment.
Emergency providers opt in.
They configure:
* categories;
* locations;
* response promise;
* emergency rates;
* current availability.
Emergency request stores:
* severity;
* event;
* category;
* required arrival;
* location;
* original booking;
* failure reason;
* scope;
* budget;
* candidate providers.
Allow broadcast to a controlled matching pool.
Do not spam every provider.
Track:
* delivered;
* opened;
* interested;
* quote;
* accepted.
 
⸻
 
38. PAYMENT ARCHITECTURE
Create a Payment Orchestration layer.
Do not scatter Stripe calls throughout UI components.
It should support multiple transaction types:
* supplier booking;
* venue hire;
* deposit;
* balance payment;
* standby fee;
* emergency service;
* ticket order;
* ticket resale;
* refund;
* platform boost/ad;
* subscription;
* provider payout;
* promoter commission;
* affiliate commission.
Every transaction must have a canonical internal record.
 
⸻
 
39. NO “ESCROW” CLAIMS
Do not label Gala Dock as holding regulated escrow unless the company has the appropriate regulated arrangement.
Use accurate product language such as:
* Protected Payment;
* Payment Protection;
* Payment Pending;
* Provider Payout Pending;
* Scheduled Release;
only where legally/product-contractually supported.
The software must be able to explain the actual payment state accurately.
 
⸻
 
40. STRIPE CONNECT PAYMENT STRATEGY
Build a configurable strategy layer because payment routing can differ.
Possible Stripe Connect approaches include:
* destination charges for single-provider marketplace transactions where appropriate;
* separate charges and transfers where one platform-collected payment must later be distributed or split and where supported;
* direct charges only where the commercial/legal relationship genuinely requires the connected provider to own the charge.
Do not select a charge architecture solely because it is technically convenient.
Document:
* merchant-of-record assumptions;
* Stripe fee liability;
* refund liability;
* dispute liability;
* tax treatment assumptions;
* transfer timing;
* platform fee treatment.
Before shipping payments, validate current Stripe Connect documentation and the agreed legal model.
 
⸻
 
41. MARKETPLACE COMMISSION
Commission must be configuration driven.
Do not bury 10% throughout code.
Example plan model:
Free Provider:
* £0 subscription;
* marketplace fee e.g. 10%.
Pro Provider:
* subscription;
* lower commission.
Team:
* higher subscription;
* lower commission.
Enterprise:
* negotiated.
Commission rules can vary by:
* plan;
* country;
* category;
* partner arrangement;
* promotion.
Snapshot the applied rule onto each booking so historical economics cannot change when a plan changes.
 
⸻
 
42. INTERNAL LEDGER
Implement a proper immutable financial ledger.
Do not calculate historical balances only from current booking fields.
Represent:
* gross booking;
* tax where applicable;
* platform commission;
* processing cost where known;
* provider earning;
* promoter commission;
* refund;
* cancellation allocation;
* dispute deduction;
* payout;
* reversal.
Use ledger entries.
Financial records must be auditable.
 
⸻
 
43. RELEASE / PAYOUT STATES
A booking payment can move through:
* amount_due;
* payment_pending;
* payment_succeeded;
* protected_pending_delivery;
* eligible_for_provider_transfer;
* transfer_created;
* payout_pending;
* paid_out;
* partially_refunded;
* refunded;
* disputed.
Actual payment-provider events must remain authoritative.
Do not infer payment success from client redirects.
 
⸻
 
44. MARKETPLACE DISPUTE MANAGEMENT
There are two related but separate systems:
Gala Dock Booking Dispute
Customer/provider operational dispute.
Reasons:
* service not delivered;
* materially different service;
* provider cancellation;
* customer cancellation disagreement;
* damage;
* late arrival;
* partial service;
* venue issue.
Collect:
* booking terms snapshot;
* messages;
* uploaded evidence;
* delivery evidence;
* arrival/check-in;
* cancellation history;
* payment history;
* photos/files;
* timeline.
Workflow:
* opened;
* evidence_collection;
* provider_response;
* mediation/review;
* resolution_proposed;
* resolved;
* escalated.
 
⸻
 
Card Chargeback
Stripe/card-network dispute.
Synchronise:
* dispute ID;
* amount;
* reason;
* evidence deadline;
* Stripe status;
* submitted evidence;
* result.
Create evidence packs from relevant Gala Dock records.
Never imply Gala Dock can control the card issuer’s final dispute decision.
 
⸻
 
45. CANCELLATION ENGINE
Cancellation must be policy driven.
Store terms snapshot on booking confirmation.
Support:
* customer cancellation;
* provider cancellation;
* mutual cancellation;
* force majeure/manual review;
* partial cancellation;
* reschedule.
Calculate consequences based on:
* policy;
* date;
* deposit;
* completed work;
* nonrecoverable cost;
* jurisdiction;
* agreed exception.
Provider cancellation can trigger:
1. reliability impact;
2. refund flow;
3. backup activation;
4. replacement search;
5. support case;
6. potential platform consequences.
Do not use one blanket “forfeit” rule globally.
 
⸻
 
46. TICKET SYSTEM — CORE MODEL
Build professional-grade ticketing.
Core entities:
* event;
* ticket configuration;
* tier;
* release;
* section;
* seat;
* table;
* allocation;
* inventory hold;
* order;
* order item;
* attendee/ticket holder;
* entitlement;
* QR/barcode credential;
* scan;
* promo code;
* access code;
* refund;
* transfer;
* resale listing;
* resale transaction.
Support:
* free tickets;
* paid tickets;
* GA;
* reserved sections;
* individual reserved seats;
* tables;
* VIP;
* accessible inventory;
* staff/guest allocations;
* promoters;
* hidden ticket links;
* presale;
* timed releases;
* order limits;
* waiting lists.
 
⸻
 
47. TICKET INVENTORY SAFETY
Ticket inventory must be concurrency safe.
Use transactional allocation.
When checkout begins:
create short-lived inventory reservation.
Prevent oversell at database level.
Reservation expires automatically.
Do not rely on frontend counts.
Seat/ticket sale race conditions must be tested under concurrent load.
 
⸻
 
48. TICKET PURCHASE
Checkout should cover:
* selection;
* accessibility;
* quantity;
* seat/table selection;
* promo code;
* buyer details;
* attendee details where required;
* fees;
* refund/transfer rules;
* payment;
* confirmation.
Use Stripe PaymentIntent/Checkout strategy according to current architecture.
Ticket creation only after authoritative payment success.
 
⸻
 
49. TICKET TRANSFER
Allow user-to-user ticket transfer.
Flow:
1. owner initiates transfer;
2. recipient accepts;
3. original entitlement becomes invalid;
4. new entitlement is created/assigned;
5. new secure entry credential is generated;
6. audit retained.
Never permit both tickets to remain valid.
 
⸻
 
50. OFFICIAL TICKET RESALE
Do not build an uncontrolled speculative StubHub clone.
Build official resale.
Event policy controls:
* resale enabled;
* maximum resale price;
* face-value cap if required;
* resale window;
* fees;
* refund/settlement mechanism.
Flow:
1. current holder lists eligible ticket;
2. ticket becomes resale locked;
3. buyer purchases;
4. old entitlement invalidates;
5. new entitlement issues;
6. original holder settlement is created according to policy.
Track resale fraud/risk.
 
⸻
 
51. TICKET SCANNING
Build PWA/mobile check-in.
Support:
* camera scanner;
* manual lookup;
* attendee search;
* section/table lookup;
* admission history;
* duplicate scan warning;
* re-entry policy;
* offline-safe scanning strategy;
* reconciliation after reconnection.
Do not simply trust a static QR image indefinitely if the current security architecture supports stronger credential designs.
 
⸻
 
52. VENUE MAP ENGINE
Build one reusable mapping engine.
There are two layers.
Structural Venue Map
Owned by venue/provider.
Event Overlay
Owned/configured by organizer within venue constraints.
 
⸻
 
53. VENUE MAP STRUCTURAL COMPONENTS
Support component palette such as:
* room;
* wall;
* partition;
* entrance;
* exit;
* emergency exit;
* corridor;
* stairs;
* lift;
* accessible route;
* accessible entrance;
* stage;
* fixed stage;
* bar;
* catering point;
* kitchen;
* toilet;
* accessible toilet;
* cloakroom;
* reception;
* first-aid point;
* fire equipment point;
* loading access;
* green room;
* backstage;
* storage;
* fixed seating;
* balcony;
* fixed booth;
* restricted zone.
Components need:
* geometry;
* dimensions;
* position;
* rotation;
* label;
* capacity implications;
* accessibility;
* restrictions;
* locked status.
 
⸻
 
54. EVENT OVERLAY COMPONENTS
Allow event managers to place/configure:
* stage configuration;
* temporary stage;
* round tables;
* rectangular tables;
* banquet tables;
* cocktail tables;
* chairs;
* numbered seats;
* standing zones;
* GA areas;
* VIP areas;
* reserved zones;
* booths;
* vendor stalls;
* sponsor areas;
* merchandise;
* mobile bar;
* catering station;
* buffet;
* dance floor;
* photo booth;
* DJ booth;
* AV desk;
* camera position;
* production control;
* lighting position;
* speaker position;
* queue;
* barrier;
* security post;
* check-in desk;
* coat check;
* first aid;
* temporary toilets;
* generators;
* staff-only areas;
* temporary accessibility route;
* emergency lane.
 
⸻
 
55. MAP EDITOR UX
Enterprise editor needs:
* drag/drop;
* zoom;
* pan;
* snapping;
* grid;
* rulers;
* alignment;
* multi-select;
* copy/paste;
* keyboard movement;
* undo/redo;
* layers;
* lock/unlock;
* grouping;
* duplicate;
* measurement;
* labels;
* capacity counters;
* version history;
* templates;
* compare changes;
* autosave;
* manual save/checkpoint.
Must remain usable on tablets.
Desktop gets full editor.
Mobile gets view/light edit rather than forcing unsuitable precision editing.
 
⸻
 
56. MAP CONSTRAINT ENGINE
Venue constraints must override event overlays.
Examples:
* locked fire exit cannot be covered;
* accessible route cannot be blocked;
* max space capacity cannot be exceeded;
* restricted area cannot become ticket inventory;
* structural walls cannot be moved by Organizer;
* fixed seating remains fixed unless venue explicitly allows change;
* stage configurations can have capacity limits.
Provide real-time validation.
 
⸻
 
57. MAP + TICKETING
Allow sections/seats/tables to bind to ticket inventory.
Example:
Section A → Premium tier.
Table 1 → VIP table inventory.
Seat A10 → reserved seat entitlement.
Maintain synchronisation between:
* map availability;
* ticket reservation;
* sold ticket;
* refund;
* transfer;
* official resale;
* killed/blocked seat.
 
⸻
 
58. MAP + OPERATIONS
Map should also support operational overlay:
* supplier arrival zones;
* backstage;
* first aid;
* security;
* evacuation;
* production;
* camera;
* food;
* bar;
* staff-only zones.
Do not force ticketing and operational overlays into identical visibility.
Use layers.
 
⸻
 
59. VENUE HIRE MANAGEMENT
Venue capability must be deep.
Venue Profile tabs:
Overview | Spaces & Map | Packages | Operations | Commercial
Support:
* multiple venues per workspace;
* multiple spaces per venue;
* nested/linked spaces;
* exclusive hire;
* partial hire;
* multi-space bookings;
* multi-day bookings;
* setup windows;
* teardown windows;
* turnaround buffers;
* blackout dates;
* seasonal availability;
* business hours;
* venue-wide conflicts;
* space-level conflicts.
 
⸻
 
60. VENUE COMMERCIAL ENGINE
Support:
* hourly hire;
* half day;
* full day;
* evening;
* flat event fee;
* per-person;
* minimum spend;
* bar minimum;
* catering minimum;
* package price;
* hybrid pricing;
* peak/off-peak;
* day-of-week rates;
* seasonal rates;
* setup fee;
* cleanup fee;
* overtime;
* security requirement;
* damage deposit;
* booking deposit.
Do not force one pricing model.
 
⸻
 
61. VENUE ENQUIRY & HOLD FLOW
Venue request can support:
* Enquiry;
* Request to Book;
* Instant Book where eligible.
Venue response can:
* confirm availability;
* offer alternative space;
* offer alternative date;
* quote;
* place conditional hold;
* request clarification;
* decline.
Hold must identify exactly:
* venue;
* space;
* date/time;
* setup/teardown window;
* expiry;
* blocking level.
 
⸻
 
62. BEO / EVENT ORDER MANAGEMENT
For venue bookings support a professional BEO/event-order style record.
Include:
* event details;
* room;
* times;
* setup;
* layout;
* capacity;
* catering;
* bar;
* AV;
* staffing;
* access;
* deliveries;
* client contacts;
* supplier access;
* special requirements;
* accessibility;
* financial summary;
* approval/version.
Maintain version history.
 
⸻
 
63. FOOD & DRINK SYSTEM
Build food/drink as real event commerce rather than a text note.
Provider/venue can create Menus and Packages.
Support:
* menu;
* section;
* item;
* variation;
* add-on;
* price;
* per-person pricing;
* fixed package pricing;
* quantity pricing;
* minimum guests;
* maximum guests;
* serving style;
* allergen information;
* dietary tags;
* service window;
* preparation requirements.
Dietary examples:
* vegetarian;
* vegan;
* gluten-free;
* halal;
* kosher;
* nut-related disclosures;
* dairy-free.
Do not claim allergen safety beyond supplier-provided information.
 
⸻
 
64. CATERING EVENT BUILD
For customer/organizer:
Select:
* caterer/venue;
* package;
* guest count;
* courses/items;
* dietary requirements;
* serving style;
* timing;
* staffing;
* equipment;
* final-number deadline.
Final guest count changes should show commercial consequences before confirmation.
 
⸻
 
65. BAR SYSTEM
Support:
* cash bar;
* hosted bar;
* open bar;
* drink tokens;
* prepaid package;
* minimum spend;
* consumption tab;
* dry hire;
* mobile bar;
* bartenders only;
* corkage;
* glassware;
* bar equipment.
Record:
* licensing requirements;
* age restrictions;
* operating hours;
* staffing;
* setup;
* minimum spend;
* deposit.
Keep jurisdictional legal rules configurable.
 
⸻
 
66. CUSTOMER EVENT BUILD ENGINE
This is a major Gala Dock differentiator.
Route:
/account/events/[id]/build
UI:
Left rail
Category library.
Centre
Event Build Canvas.
Right rail
Budget / readiness / availability / outstanding dependencies.
Make it premium, visual and fast.
Do not make it feel like procurement software.
 
⸻
 
67. CUSTOMER BUILD CATEGORIES
Adapt to event type.
Potential categories:
* Venue;
* Food;
* Drinks;
* Entertainment;
* Music/DJ;
* Photography;
* Video;
* Styling;
* Decor;
* Flowers;
* Activities;
* Children;
* Staff;
* Security;
* Production;
* AV;
* Furniture;
* Equipment;
* Transport;
* Accommodation;
* Extras.
Do not show irrelevant categories.
 
⸻
 
68. EVENT-TYPE INTELLIGENCE
Different event types seed different builds.
Examples:
Children’s Birthday
Prioritise:
* venue;
* entertainer;
* bouncy castle/activity;
* food;
* cake;
* photography;
* decorations.
Wedding
Prioritise:
* venue;
* ceremony;
* catering;
* bar;
* entertainment;
* photography;
* videography;
* styling;
* flowers;
* transport;
* accommodation.
Nightclub
Prioritise:
* venue;
* DJs;
* rooms;
* AV;
* security;
* bar;
* ticketing;
* promotions;
* event staff.
Conference
Prioritise:
* venue;
* rooms/tracks;
* AV;
* speakers;
* registration;
* catering;
* sponsors;
* staffing.
One Event schema.
Different templates.
 
⸻
 
69. BUILD DEPENDENCIES
Allow booking dependencies.
Typical:
Venue confirmation → dependent provider bookings
But dependencies are configurable.
An Event Build card should expose:
* estimated;
* requested;
* awaiting response;
* held;
* standby;
* confirmed;
* unavailable;
* replacement needed.
Show countdown.
 
⸻
 
70. EVENT BUILD BUDGET
Live budget rail must show:
* target budget;
* estimated;
* requested;
* conditionally held;
* confirmed;
* paid;
* due;
* standby fees;
* remaining budget.
Never mix estimate with committed spend without distinction.
 
⸻
 
71. BACKUP PROVIDERS
Every critical Event Build item can have:
* primary;
* backup preference;
* paid standby.
If primary fails:
1. flag event readiness;
2. evaluate backup;
3. trigger replacement search;
4. optionally activate standby;
5. notify relevant users.
 
⸻
 
72. CUSTOMER → PROFESSIONAL UPGRADE
Customer can choose:
Switch to Professional Management
Do not create a second event.
Same canonical Event ID.
Preserve:
* bookings;
* suppliers;
* venue;
* tickets;
* guests;
* money;
* files;
* messages.
Unlock Organizer-level views/capabilities according to account/workspace setup.
 
⸻
 
73. SALES SYSTEM
Organizer Sales:
Pipeline | Proposals
Lead states:
* New;
* Qualified;
* Proposal;
* Negotiating;
* Won;
* Lost.
Lead Profile contains:
* client;
* contacts;
* event requirement;
* dates;
* flexible dates;
* location;
* venue preference;
* guests;
* budget;
* event type;
* source;
* owner;
* probability;
* next action;
* activity;
* communications.
 
⸻
 
74. PROPOSALS
Proposal must support:
* versions;
* packages;
* optional items;
* line items;
* tax;
* discount;
* assumptions;
* validity;
* client comments;
* internal notes;
* acceptance;
* e-signature integration where supported;
* deposit requirement.
Conversion to Event must create/transfer appropriate structured information.
Do not copy text blobs into Event.
 
⸻
 
75. SALES AGENT
Organizer Gala Agent should:
* qualify leads;
* identify missing info;
* draft follow-ups;
* draft proposals;
* detect stalled opportunities;
* estimate probability;
* schedule follow-up;
* analyse conversion;
* convert accepted proposals into Event skeletons.
External sending follows Agent policy.
 
⸻
 
76. TICKETS & PROMOTION HUB
Route:
/organizer/tickets-promotion
Tabs:
Ticketing | Promotion | Directory | Promoters | Media | Performance
This is the cross-event management surface.
Event-specific configuration remains within the Event.
 
⸻
 
77. EVENT DIRECTORY
Public discovery needs:
* event categories;
* city pages;
* date pages;
* venue pages;
* organizer pages;
* event series;
* followed entities;
* related events.
Support discovery filters:
* date;
* distance;
* category;
* age;
* accessibility;
* free/paid;
* price;
* venue;
* format.
Use SEO-safe canonical URLs.
 
⸻
 
78. EVENT CALENDAR PROMOTION
Build event calendars as a distribution system.
Internal calendars:
* All Events;
* Today;
* Tomorrow;
* This Weekend;
* Next Weekend;
* This Month;
* City;
* Category;
* Venue;
* Organizer;
* Series.
Events can become eligible automatically based on visibility and moderation.
Allow:
* Follow Venue;
* Follow Organizer;
* Follow Category;
* Save Event.
Notifications must honour preferences.
 
⸻
 
79. EXTERNAL CALENDAR SUPPORT
Support:
* Apple/ICS;
* Google Calendar;
* Outlook.
For organizers/venues, consider embeddable event-calendar widgets.
Do not create separate copies of events.
Use canonical event data.
 
⸻
 
80. POSTER & MEDIA BUILDER
Within Gala Dock support high-quality event-native assets.
Templates:
* A3;
* A4;
* square;
* 4:5;
* Story;
* 16:9 screen;
* QR poster;
* ticket launch;
* early bird;
* final tickets;
* sold out;
* event-day information.
Auto-bind:
* event name;
* date;
* venue;
* city;
* performers;
* price;
* ticket URL;
* QR;
* organiser;
* sponsors.
Allow uploaded previous-event photos/videos.
Public event pages can display:
Watch last year’s event
Do not rebuild full Caption Fox functionality.
Advanced marketing generation can hand off to Caption Fox through an integration.
 
⸻
 
81. ON-PLATFORM PROMOTION / ADS
Build owned Gala Dock promotion inventory.
Examples:
* Featured Event;
* Home Feature;
* Category Boost;
* City Boost;
* Calendar Spotlight;
* Weekend Spotlight;
* Venue Feature;
* Search Highlight.
Create inventory/rate model.
Track:
* campaign;
* placement;
* start/end;
* budget;
* impression;
* click;
* event-page visit;
* ticket conversion;
* attributed revenue.
Use proper sponsored labels.
Do not deceive users with disguised advertising.
 
⸻
 
82. PROMOTERS
Event promoters/referrers do not require full workspace.
Provide lightweight portal.
Promoter gets:
* referral link;
* referral code;
* approved assets;
* event details;
* clicks;
* attributed orders;
* sales;
* commission;
* payment status.
Organizer configures commission structure.
Snapshot commission terms.
 
⸻
 
83. AFFILIATES / PLATFORM PARTNERS
Keep separate from Event Promoters.
Platform partners refer:
* organizers;
* providers;
* venues;
* suppliers.
Track:
* referral;
* attribution;
* qualifying revenue;
* commission rule;
* earned commission;
* payout.
Calculate partner commission from Gala Dock’s eligible platform revenue according to policy, not blindly from total GMV.
 
⸻
 
84. TEAM MANAGEMENT — ORGANIZER
Organizer Team tabs:
People | Availability | Assignments | Shifts
Support:
* members;
* external event crew;
* roles;
* skills;
* permissions;
* base location;
* rates/cost;
* availability;
* event assignments;
* shifts;
* responsibilities;
* run-sheet duties.
Do not build a full HR/payroll suite unless needed.
 
⸻
 
85. TEAM CONFLICT ENGINE
Detect:
* overlapping shifts;
* travel-time impossibility;
* venue overlap;
* unavailable staff;
* insufficient staffing;
* role qualification;
* missing critical role.
Surface conflicts:
* Event Plan;
* Calendar;
* Team;
* Home;
* Gala Agent.
 
⸻
 
86. LIVE EVENT MODE
Event Operations should gain a live command mode on event day.
Prioritise:
NOW | NEXT | DELAYED | ISSUES
Show:
* run sheet;
* arrivals;
* team;
* provider check-in;
* venue status;
* ticket entry;
* incidents;
* communications.
Provider check-ins should report:
* expected;
* en route where supplied;
* arrived;
* checked in;
* late;
* absent.
 
⸻
 
87. EVENT READINESS ENGINE
Every event has a readiness model.
Possible domains:
* venue;
* suppliers;
* staff;
* tickets;
* guests;
* money;
* compliance;
* risk;
* logistics;
* promotion;
* operations.
Expose:
* Ready;
* Attention;
* Blocked;
* Not Required.
Overall readiness should be explainable.
Do not produce an opaque AI score.
 
⸻
 
88. EVENT FEASIBILITY ENGINE
Detect logical incompatibilities.
Examples:
* supplier setup requires 3 hours but venue access provides 2;
* guest count exceeds capacity;
* equipment exceeds power constraint;
* bouncy castle exceeds ceiling;
* supplier travel between bookings impossible;
* ticket capacity exceeds approved event capacity;
* bar closes before scheduled programme;
* security coverage insufficient for configured requirements.
Warnings should link to fix paths.
 
⸻
 
89. COMMUNICATIONS
Top-bar communications surface remains separate from Gala Agent.
Support:
* Gala Dock direct messages;
* connected email;
* optional SMS;
* optional WhatsApp where configured.
Every thread can link to:
* event;
* booking;
* venue;
* service;
* opportunity;
* proposal;
* invoice;
* support case.
 
⸻
 
90. EMAIL
Preferred connections:
* Google Workspace OAuth;
* Microsoft 365 OAuth.
Fallback:
* IMAP for retrieval/sync;
* SMTP for sending.
Do not incorrectly use IMAP for sending.
Store secure encrypted credentials/tokens.
Do not expose provider credentials client side.
Use transactional email provider separately for Gala Dock platform/system email.
 
⸻
 
91. EMAIL CONTEXT LINKING
Incoming/outgoing professional email should be associable with:
* Event;
* Venue request;
* Supplier request;
* Booking;
* Lead;
* Proposal;
* Invoice.
Use message headers/thread IDs and controlled matching.
Agent may suggest record association but uncertain matching needs confirmation.
 
⸻
 
92. CALENDAR INTEGRATIONS
Support connected:
* Google Calendar;
* Microsoft Outlook;
* ICS.
Sync safely.
Use external IDs.
Do not create infinite sync loops.
Track sync origin/version.
Conflicts between Gala Dock and external calendar must be handled explicitly.
 
⸻
 
93. CAPTION FOX INTEGRATION
Gala Dock retains event-native promotion.
Caption Fox owns:
* advanced campaign generation;
* large-scale creative campaigns;
* sophisticated AI video/UGC;
* general brand marketing;
* broader SEO programmes.
Provide optional:
Open/Create in Caption Fox
Pass:
* event;
* date;
* venue;
* artwork;
* performers;
* tickets;
* audience;
* brand;
* campaign goals.
Accept returned:
* campaign ID;
* assets;
* links;
* high-level performance if integration supports it.
Integration failure must not break the event.
 
⸻
 
94. CUSTOMER REVIEWS
Only eligible completed bookings generate verified marketplace reviews.
Support:
* quality;
* communication;
* value;
* punctuality/reliability;
* overall;
* written review;
* optional media.
Providers may respond.
Moderation must preserve audit.
Review removal requires policy reason.
 
⸻
 
95. SEARCH
Global search must be a first-class visible top-bar experience.
Search:
* Events;
* People;
* Clients;
* Venues;
* Services;
* Providers;
* Bookings;
* Tickets;
* Leads;
* Proposals;
* Files;
* Invoices.
Marketplace search additionally supports geospatial filtering.
Use PostGIS where appropriate.
Do not build separate search systems for each feature without reason.
 
⸻
 
96. DATABASE DESIGN
Normalise around shared canonical records.
Expected conceptual groups include:
Foundation
* users;
* workspaces;
* workspace_members;
* roles;
* permissions;
* contacts;
* files;
* messages;
* notifications;
* activities;
* approvals;
* audit_events;
* integrations.
Events
* events;
* event_programme_items;
* event_schedule_items;
* event_tasks;
* event_guests;
* event_assignments;
* event_risks;
* event_incidents;
* event_readiness_items.
Sales
* leads;
* proposals;
* proposal_versions;
* proposal_items.
Marketplace
* providers;
* provider_capabilities;
* venues;
* venue_spaces;
* venue_layouts;
* services;
* provider_packages;
* availability_rules;
* marketplace_requests;
* request_recipients;
* quotes;
* bookings;
* conditional_holds;
* standby_commitments;
* emergency_requests.
Trust
* provider_documents;
* verification_records;
* insurance_records;
* reliability_metrics;
* reviews.
Ticketing
* ticket_configurations;
* ticket_tiers;
* ticket_releases;
* ticket_sections;
* ticket_seats;
* ticket_inventory;
* inventory_holds;
* ticket_orders;
* ticket_order_items;
* ticket_entitlements;
* ticket_scans;
* ticket_transfers;
* ticket_resale_listings;
* ticket_resale_transactions.
Maps
* venue_maps;
* venue_map_versions;
* venue_map_objects;
* event_map_overlays;
* event_map_versions;
* event_map_objects.
Promotion
* event_distribution;
* calendar_feeds;
* follows;
* media_assets;
* poster_templates;
* event_promoters;
* promoter_links;
* promotion_campaigns;
* promotion_placements;
* attribution_events.
Commerce
* payment_records;
* ledger_entries;
* refunds;
* transfers;
* payouts;
* booking_disputes;
* stripe_disputes;
* invoices;
* subscriptions;
* partner_commissions.
Agent
* agent_threads;
* agent_runs;
* agent_run_steps;
* agent_waits;
* agent_approvals;
* agent_routines;
* agent_routine_runs;
* agent_tool_executions;
* agent_artifacts.
Adapt names to existing schema rather than duplicate equivalent existing tables.
 
⸻
 
97. EVENT SOURCING RELATIONSHIPS
Booking/quote/provider records must always preserve relationship back to:
* event;
* workspace;
* requesting person;
* marketplace request;
* quote;
* venue/space/service/package;
* payment.
Never lose traceability through conversion.
 
⸻
 
98. RLS
Every tenant-owned table must have RLS.
Test:
* Customer cannot access another customer’s private event.
* Organizer A cannot access Organizer B.
* Provider A cannot access Provider B’s private bookings.
* Provider only sees event data required for their opportunity/booking.
* Customer does not gain Organizer access accidentally.
* Promoter sees only attributed campaign data.
* Affiliate sees only eligible referral data.
* Platform admin access is explicitly controlled.
* Agent cannot bypass caller/workspace permissions.
Never rely solely on route middleware for data isolation.
 
⸻
 
99. PERMISSION SYSTEM
Use workspace roles plus granular permissions.
Organizer domains:
* events.read;
* events.write;
* event.delete;
* sales.read/write;
* marketplace.request;
* tickets.manage;
* promotion.manage;
* team.manage;
* finance.read;
* finance.write;
* refunds.approve;
* agent.use;
* agent.approve;
* settings.manage.
Provider domains:
* opportunities.read/respond;
* bookings.read/manage;
* availability.manage;
* listings.manage;
* team.manage;
* money.read;
* payouts.read;
* quotes.send;
* booking.accept;
* agent.use;
* agent.approve;
* settings.manage.
Do not put role names throughout code.
Use permission capabilities.
 
⸻
 
100. AUDIT LOGGING
Audit:
* login/security events;
* permissions;
* membership changes;
* Agent actions;
* booking transitions;
* quote changes;
* payment transitions;
* refunds;
* disputes;
* ticket adjustments;
* seat inventory changes;
* map versions;
* public publication;
* verification;
* payout configuration.
Audit events need actor:
* user;
* Agent acting for user;
* system;
* webhook;
* admin.
 
⸻
 
101. DELETE / CRUD BEHAVIOUR
Full CRUD does not mean destructive database deletion.
Use:
* archive;
* soft delete;
* cancel;
* revoke;
* void;
where business records require history.
Permanent deletion must follow:
* retention policy;
* legal requirements;
* financial restrictions;
* relationship constraints.
Agent must never hard-delete financial history.
 
⸻
 
102. WIZARD ALIGNMENT
Agent functionality must use the same services/validators as all user-facing wizards.
Examples include:
Organizer:
* Create Event;
* Proposal;
* Marketplace Request;
* Ticket Setup;
* Promotion setup;
* Emergency sourcing;
* Save Event Template.
Provider:
* Add Venue;
* Add Space;
* Add Service;
* Add Package;
* Quote;
* Booking response;
* Availability;
* emergency availability;
* verification/payment onboarding.
Customer:
* Plan Event;
* Booking Request;
* Customer Ticket Setup.
Do not let Agent create invalid records that the wizard would reject.
 
⸻
 
103. DESIGN QUALITY
Preserve the premium Gala Dock visual system.
Requirements:
* bright enterprise canvas;
* clear hierarchy;
* sharp typography;
* high information density without clutter;
* restrained borders;
* premium cards;
* strong table/list design;
* compact sidebars;
* excellent spacing;
* useful contextual drawers;
* responsive layouts;
* thoughtful empty/loading/error states.
Agent UI must feel like a high-value operations console.
Not a chat app.
 
⸻
 
104. AGENT WORK UI
Desktop layout should support:
Header
Goal + scope + run status.
Main canvas
Structured run plan.
Each step displays:
* status;
* action;
* record;
* result;
* elapsed time;
* waiting reason;
* approval state.
Context rail
Relevant:
* event;
* booking;
* providers;
* budget;
* integrations;
* constraints;
* permissions.
Artifact panel
Generated:
* proposal;
* budget;
* event plan;
* quote comparison;
* poster;
* schedule;
* supplier shortlist.
 
⸻
 
105. AGENT HISTORY
History needs filtering by:
* user;
* date;
* event;
* mission;
* state;
* approval;
* tool;
* failure.
Run detail must reconstruct exactly what happened.
Never show hidden chain-of-thought.
Show:
* goal;
* plan;
* tool actions;
* evidence/results;
* decisions;
* approval reasoning summary;
* changes.
 
⸻
 
106. AGENT OBSERVABILITY
Track:
* run success;
* partial completion;
* failure;
* tool latency;
* tool error;
* retries;
* approval rate;
* cancellation;
* external wait duration;
* average run cost;
* token/API consumption;
* provider response outcome.
Protect sensitive prompt/content from unsafe analytics storage.
 
⸻
 
107. AGENT COST CONTROL
Implement:
* per-plan usage;
* monthly limits;
* concurrency;
* run budgets;
* maximum model calls;
* caching of deterministic data;
* summarisation/checkpoints for long runs;
* avoid repeatedly loading entire workspace context.
Retrieve only context needed for current step.
 
⸻
 
108. AGENT FAILURE RECOVERY
On failure:
* preserve completed work;
* never blindly replay mutations;
* identify failed step;
* expose retry;
* use idempotency;
* compensate reversible operations where necessary;
* escalate ambiguous state.
If a payment call times out:
do not assume failure.
Reconcile with Stripe first.
If an email send times out:
use provider/message IDs before retry.
 
⸻
 
109. WEBHOOK ARCHITECTURE
Webhooks must be:
* signature verified;
* idempotent;
* logged;
* retry-safe;
* order-tolerant where possible.
Handle relevant:
* Stripe payments;
* Connect;
* payouts;
* disputes;
* refunds;
* subscription;
* email;
* calendar;
* messaging;
* Caption Fox if connected.
Do not put critical state solely in browser callbacks.
 
⸻
 
110. SECURITY REQUIREMENTS
Apply:
* strict TypeScript;
* server-side authorisation;
* schema validation;
* secure cookies;
* CSRF strategy;
* XSS prevention;
* sanitisation;
* file scanning strategy;
* signed/private file URLs;
* rate limiting;
* webhook signature checking;
* SQL injection prevention;
* SSRF protection;
* secure OAuth;
* token encryption;
* secrets only server-side;
* dependency security;
* CSP where compatible.
Agent tool parameters must be schema validated.
 
⸻
 
111. FILE SECURITY
Uploads need:
* accepted MIME policy;
* maximum size;
* virus/malware scanning strategy;
* access control;
* tenant path isolation;
* signed access;
* expiry;
* metadata.
Provider credential documents should never become publicly downloadable merely because a provider has a public marketplace profile.
Public verification status is distinct from private source document.
 
⸻
 
112. FINANCIAL SECURITY
Never log:
* raw card number;
* CVV;
* full secret payment credentials.
Sensitive bank/payout settings require:
* reauthentication;
* permissions;
* audit.
Agent cannot independently modify payout destinations.
 
⸻
 
113. CONCURRENCY
Test:
* two users booking final slot;
* two customers selecting same seat;
* two organizers modifying same hold;
* Agent and user editing same event;
* webhook and manual refund arriving simultaneously;
* supplier accepting overlapping requests;
* emergency replacement while primary restores service.
Use transactional state transitions/locking/version checks where necessary.
 
⸻
 
114. STATE MACHINES
Implement explicit transition validation for:
* booking;
* hold;
* standby;
* opportunity;
* quote;
* ticket order;
* resale;
* dispute;
* payout;
* Agent run.
Do not allow arbitrary status strings to be written by UI.
 
⸻
 
115. RESPONSIVE/PWA
Test:
* 320px;
* 360px;
* 390px;
* 430px;
* tablet portrait;
* tablet landscape;
* laptop;
* 1440px desktop;
* 1920px;
* sensible high-density widescreen.
Support:
* portrait;
* landscape;
* touch;
* keyboard;
* mouse.
PWA should prioritise:
* tickets;
* check-in;
* event-day operations;
* booking status;
* messaging;
* provider jobs;
* emergency actions.
 
⸻
 
116. ACCESSIBILITY
Target WCAG 2.2 AA.
Ensure:
* keyboard navigation;
* focus management;
* labels;
* screen-reader semantics;
* modal/drawer traps;
* contrast;
* reduced motion;
* accessible forms;
* non-colour-only states.
Map/ticket editing needs accessible alternatives where full visual manipulation cannot be fully represented.
 
⸻
 
117. TESTING
Create comprehensive tests.
Unit
* calculations;
* transitions;
* permissions;
* commission;
* reliability;
* booking expiry;
* Agent policy;
* ticket inventory;
* resale;
* cancellation.
Integration
* Supabase;
* RLS;
* Stripe;
* Connect;
* Agent tools;
* email;
* calendar;
* notifications.
E2E
Use Playwright.
Cover full journeys.
 
⸻
 
118. REQUIRED E2E JOURNEY — CUSTOMER
1. Register.
2. Choose Plan an Event.
3. Create birthday.
4. Set date/location/guests/budget.
5. Receive recommended build.
6. Search venue.
7. Send venue request.
8. Add conditional supplier holds.
9. Venue confirms.
10. Complete provider bookings.
11. Pay.
12. Manage guests.
13. Create simple tickets.
14. Run event.
15. Review suppliers.
 
⸻
 
119. REQUIRED E2E JOURNEY — ORGANIZER
1. Login.
2. Create professional event.
3. Set economics.
4. Source venue.
5. Request multiple providers.
6. Compare quotes.
7. Book providers.
8. Build venue map.
9. Configure ticket inventory.
10. Publish public page.
11. Generate poster.
12. Publish directory/calendar promotion.
13. Assign team.
14. Run Agent readiness mission.
15. Sell ticket.
16. Scan ticket.
17. Complete event.
18. Settle providers.
19. Close out finances.
 
⸻
 
120. REQUIRED E2E JOURNEY — PROVIDER
1. Create Provider workspace.
2. Enable Supplier.
3. Complete Connect onboarding.
4. Upload required credentials.
5. Create service.
6. Configure availability.
7. Receive opportunity.
8. Respond within SLA.
9. Quote.
10. Booking accepted.
11. Assign staff.
12. Complete delivery.
13. Payment/payout state updates.
14. Receive review.
Repeat with Venue mode including:
* venue;
* space;
* map;
* package;
* minimum spend;
* conditional hold;
* BEO.
 
⸻
 
121. REQUIRED E2E JOURNEY — EMERGENCY
1. Existing provider cancels.
2. Event becomes at risk.
3. Backup checked.
4. No guaranteed backup.
5. Organizer launches Emergency Supply.
6. Eligible providers receive request.
7. Responses arrive.
8. Agent compares options.
9. Organizer approves replacement.
10. Payment adjustment runs.
11. New provider becomes confirmed.
12. Event readiness recovers.
13. audit trail complete.
 
⸻
 
122. REQUIRED E2E JOURNEY — TICKET RESALE
1. Buyer purchases ticket.
2. Ticket issued.
3. Buyer lists through Official Resale.
4. Original credential locks.
5. New buyer purchases.
6. Original entitlement invalidates.
7. New credential issued.
8. seller settlement/refund created according to policy.
9. gate scanner accepts only valid entitlement.
 
⸻
 
123. REQUIRED E2E JOURNEY — LONG AGENT RUN
1. User creates event-launch mission.
2. Agent makes plan.
3. Agent creates safe drafts.
4. Approval required for external enquiries.
5. User approves.
6. enquiries sent.
7. run enters waiting_external.
8. process stops consuming execution.
9. provider responds hours later.
10. webhook/event wakes run.
11. Agent continues.
12. quote comparison generated.
13. approval requested for booking.
14. user approves.
15. run continues.
16. mission completes.
Prove durability under deployment/restart simulation.
 
⸻
 
124. RLS PENETRATION TESTS
Attempt cross-tenant access through:
* guessed IDs;
* direct Supabase requests;
* modified URLs;
* Agent tool input;
* file IDs;
* booking IDs;
* ticket IDs;
* payment IDs;
* map IDs.
All unauthorised access must fail.
 
⸻
 
125. AGENT SECURITY TESTS
Attempt:
* prompt injection through supplier listing;
* prompt injection through email;
* malicious attachment text;
* request to bypass approval;
* request to refund beyond permission;
* request to reveal another workspace;
* request to change bank details;
* tool-result manipulation;
* replay mutation.
Agent must remain within permission/policy.
 
⸻
 
126. PAYMENT TESTS
Test:
* successful payment;
* failed payment;
* 3DS;
* webhook delay;
* duplicate webhook;
* refund;
* partial refund;
* dispute;
* failed transfer;
* connected account restriction;
* verification expiry;
* payout failure.
Do not mark money settled until authoritative.
 
⸻
 
127. PERFORMANCE
Optimise:
* event lists;
* marketplace;
* map editor;
* ticket inventory;
* Agent history;
* calendars.
Use pagination/virtualisation where appropriate.
Avoid loading every event/provider/seat in one request.
Use indexes based on real queries.
 
⸻
 
128. OBSERVABILITY
Production observability should cover:
* frontend error;
* API error;
* database error;
* webhook error;
* Agent run error;
* payment failure;
* ticket inventory error;
* email/calendar sync failure.
Include correlation IDs across:
user request → Agent run → tool → API/service → webhook where possible.
Never log secrets.
 
⸻
 
129. MIGRATION SAFETY
Before schema migrations:
* inspect production compatibility;
* use additive migrations first;
* backfill safely;
* preserve existing IDs;
* avoid destructive rename without compatibility;
* provide rollback path.
Do not wipe/reseed production.
 
⸻
 
130. IMPLEMENTATION ORDER
Implement in dependency order:
Phase 1
Foundation, schemas, states, permissions, shared service layer.
Phase 2
Provider trust/verification + Connect + credentials.
Phase 3
Marketplace requests, quotes, booking/hold/standby/emergency.
Phase 4
Customer Event Build.
Phase 5
Venue/Space hire + map foundation + menu/F&B.
Phase 6
Professional Organizer depth.
Phase 7
Ticketing + map inventory + resale.
Phase 8
Promotion, directory, calendars, posters, promoters.
Phase 9
Gala Agent typed Tool Registry.
Phase 10
Organizer skills/missions.
Phase 11
Provider skills/missions.
Phase 12
Durable routines/long-running workflows.
Phase 13
Admin controls/observability/trust/support.
Phase 14
Complete QA, security, responsiveness and release audit.
Adjust order when existing code means a dependency already exists.
 
⸻
 
131. RELEASE GATES
Do not declare complete unless:
* routes work;
* buttons work;
* data persists;
* RLS passes;
* payments are correctly reconciled;
* Agent tools are permissioned;
* Agent long-runs survive restart;
* no duplicate side effects occur;
* ticket oversell is impossible under tested race conditions;
* provider booking conflicts are prevented;
* maps save/version correctly;
* cancellations calculate correctly;
* reviews require eligible bookings;
* Stripe onboarding states are respected;
* mobile works;
* tablet works;
* desktop works;
* accessibility passes;
* automated tests pass;
* browser console is clean;
* production build succeeds.
 
⸻
 
132. VISUAL QA
Use browser automation/Playwright and the available browser inspection tools.
Compare:
* spacing;
* typography;
* widths;
* navigation;
* cards;
* tables;
* tabs;
* drawers;
* dialogs;
* responsive state.
Do not stop at functional correctness.
The finished product must visually match the established premium Gala Dock system.
Do not introduce generic unstyled shadcn/demo layouts.
 
⸻
 
133. CODE QUALITY
Require:
* strict TypeScript;
* domain services;
* typed schemas;
* reusable state machines;
* no any without justification;
* no giant god components;
* no business logic embedded in visual components;
* proper error boundaries;
* testable functions;
* documented complex financial logic;
* migrations committed;
* environment variables documented;
* no secrets committed.
 
⸻
 
134. UPDATE PRODUCT DOCUMENTATION
As implementation changes architecture, update the canonical project documents so the repository reflects the real system.
Document:
* routes;
* schemas;
* workspace navigation;
* Agent tool catalogue;
* Agent skill catalogue;
* permission matrix;
* booking state machine;
* ticket state machine;
* payment architecture;
* maps;
* marketplace rules;
* integrations;
* release/test status.
Do not leave architecture in prompt files only.
 
⸻
 
135. FINAL ACCEPTANCE STANDARD
The completed Gala Dock product should allow this entire scenario:
A consumer can create a wedding, select a venue, conditionally hold a photographer and caterer while awaiting venue confirmation, pay through protected marketplace flows, add a paid standby supplier, manage guests and tickets, and review providers afterwards.
A professional Organizer can run dozens of simultaneous events, manage clients, proposals, venues, suppliers, ticket inventory, maps, teams, budgets, promotion and live operations.
A Venue Provider can manage multiple venues/spaces, map layouts, availability, enquiries, holds, packages, F&B/bar, BEOs, staff, deposits and settlements.
A Service Provider can find opportunities, quote, manage availability, assign staff/equipment, accept emergency work, deliver bookings and receive payouts.
Gala Agent must be capable of reading, reasoning and safely executing across the appropriate parts of each workspace with:
* CRUD;
* search;
* planning;
* optimisation;
* approvals;
* waiting;
* scheduling;
* monitoring;
* long-running Missions;
* policy-based routines;
* complete au

