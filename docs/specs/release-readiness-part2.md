35. PROVIDER AGENT — FIND WORK
Implement/test ability to:
* search Gala Dock demand;
* identify matching opportunities;
* evaluate distance;
* calculate travel;
* inspect dates;
* inspect team availability;
* inspect equipment;
* inspect space availability;
* inspect profitability;
* inspect provider document status;
* inspect request deadline;
* rank opportunities.
Examples:
Find DJ work for the next four Saturdays within 30 miles.
Find venue requests for 100–200 guests where our Grand Hall fits.
Find emergency photography work this weekend.
 
⸻
 
36. PROVIDER AGENT — SLA MANAGEMENT
Monitor:
* unanswered enquiries;
* quote deadlines;
* conditional holds;
* booking confirmation deadlines;
* customer questions.
Allow routines:
Never let an enquiry get within 30 minutes of expiry without notifying me.
 
⸻
 
37. PROVIDER AGENT — VENUE MODE
Agent must understand:
* venues;
* spaces;
* capacity;
* availability;
* holds;
* turnaround;
* layouts;
* packages;
* food;
* drinks;
* BEO;
* staffing;
* minimum spend;
* deposits.
 
⸻
 
38. PROVIDER AGENT — SUPPLIER MODE
Understand:
* service areas;
* service packages;
* team;
* equipment;
* travel;
* delivery schedules;
* setup;
* teardown;
* emergency availability;
* standby;
* job profitability.
 
⸻
 
39. PROVIDER AGENT SETTINGS
Complete:
* autonomy;
* AI budget;
* credits;
* daily maximum;
* monthly maximum;
* quote authority;
* discount authority;
* availability authority;
* booking acceptance rules;
* emergency-work rules;
* geographic limits;
* minimum booking value;
* quiet hours;
* communication permissions;
* approval thresholds.
 
⸻
 
PART V — ORGANIZER AGENT FINAL SWEEP
40. ORGANIZER AGENT MUST ALIGN TO SIDEBAR
Organizer:
Home Events Calendar Sales Marketplace Tickets & Promotion Team Money Gala Agent Settings
And Event tabs:
Overview Plan Sell & Promote Operations Money
Agent must cover these domains.
 
⸻
 
41. FULL EVENT CREATION
Agent should be capable of:
Create a 500-person event in Manchester in six weeks with a £10,000 target profit.
It may:
* create event draft;
* create budget;
* create venue brief;
* source venue;
* create supplier requirements;
* build programme;
* build schedule;
* prepare ticket strategy;
* create ticket releases;
* create event page draft;
* create poster from existing assets;
* configure Gala Dock promotion;
* create team requirements;
* create risks;
* create readiness items.
Commercial/external actions follow policy/approval.
 
⸻
 
42. EVENT MANAGEMENT
Agent needs CRUD support for all ordinary Event content.
It should:
* add;
* modify;
* reschedule;
* assign;
* archive;
* cancel where authorised.
Deletion must respect financial/audit retention.
 
⸻
 
43. EVENT PROMOTION
Agent can:
* configure public listing;
* calendar distribution;
* on-site placements;
* promo codes;
* promoter links;
* poster/media designs;
* previous-event videos;
* event-page copy;
* ticket launch countdown;
* waitlist setup;
* promotion monitoring.
It cannot claim to generate photography unless a media-generation provider is actually connected.
 
⸻
 
44. EVENT-DAY AGENT
Provide event-day mission support:
* supplier arrivals;
* staff check-in;
* run sheet;
* ticket entry;
* incidents;
* delay tracking;
* missing providers;
* emergency sourcing;
* schedule changes;
* communications.
High-consequence actions still respect approval policy.
 
⸻
 
PART VI — WORKSPACE RELEASE SWEEPS
45. ORGANIZER WORKSPACE
Perform complete route-by-route audit.
For every Organizer page:
1. render;
2. inspect visually;
3. click all interactive elements;
4. submit forms;
5. validate persisted data;
6. reload and verify;
7. navigate cross-links;
8. test permission boundaries;
9. test empty state;
10. test error state;
11. test mobile/PWA;
12. test keyboard;
13. test tablet;
14. test dark/error overlays if applicable.
Fix all discovered gaps.
 
⸻
 
46. PROVIDER WORKSPACE
Perform identical full audit.
Additionally test capability modes:
* Venue only;
* Supplier only;
* Venue + Supplier;
* solo provider;
* provider team.
Adaptive Listings navigation must work.
 
⸻
 
47. CUSTOMER APP
Audit:
Discover Plan an Event My Events My Tickets Saved Messages/Notifications Account
Test:
* event creation;
* drag/build flow;
* dependencies;
* enquiries;
* bookings;
* protected-payment states;
* guests;
* ticket selling;
* ticket purchasing;
* transfer;
* resale;
* reviews.
 
⸻
 
48. PORTALS
Audit every external/scoped portal.
Examples:
* client event portal;
* promoter portal;
* provider-facing scoped links;
* affiliate/partner portal;
* secure share links.
Test:
* portal creation;
* URL;
* expiry;
* access scope;
* revocation;
* permissions;
* messages;
* uploads;
* approvals;
* payment visibility.
Workspace user must be able to:
* create;
* manage;
* revoke;
* resend;
* inspect portal access.
Portal user must never escape granted scope.
 
⸻
 
PART VII — TICKET MARKETPLACE
49. TICKET EVENT PROFILE
Public event profile must be rich.
Support:
* hero/media;
* previous-event video;
* organiser;
* date/time;
* venue;
* map;
* programme;
* performers;
* ticket tiers;
* accessibility;
* age rules;
* refund/resale policy;
* FAQs;
* sponsors;
* event status;
* related events;
* save;
* share;
* calendar.
 
⸻
 
50. EVENT LAUNCH STATES
Support:
* Draft;
* Coming Soon;
* Countdown;
* Presale;
* On Sale;
* Final Release;
* Low Availability;
* Sold Out;
* Waitlist;
* Postponed;
* Cancelled;
* Event Ended.
 
⸻
 
51. LAUNCH COUNTDOWN
Organizer can configure:
* launch timestamp;
* timezone;
* countdown page;
* preview media;
* reminder signup.
At launch:
* inventory becomes eligible;
* page transitions correctly;
* notifications trigger;
* cache invalidates.
Race-test the transition.
 
⸻
 
52. HIGH-DEMAND WAITING ROOM
Separate two concepts.
Launch Waiting Room
For exceptional high-demand launches.
Use a queue/waiting-room architecture where enabled.
Do not build fake queue numbers without server authority.
Sold-Out Waitlist
Users join:
* ticket tier;
* quantity preference;
* accessibility requirements where appropriate.
When inventory returns:
* notify eligible users;
* time-bound offer;
* next user if expired.
 
⸻
 
53. TICKET CHECKOUT E2E
Validate:
* inventory reservation;
* fees;
* promo codes;
* accessibility;
* seats;
* tables;
* buyer details;
* attendee details;
* payment;
* 3DS;
* failed payment;
* duplicate webhook;
* confirmation;
* ticket issuance.
Never issue paid ticket solely from frontend redirect.
 
⸻
 
54. TICKET DISPUTES
Implement complete operational and Stripe-dispute handling.
Maintain evidence:
* order;
* payment;
* terms;
* event state;
* attendance/scans;
* communications;
* refunds;
* transfers/resales.
 
⸻
 
55. TICKET RESALE
Official resale only.
At release-readiness time:
* research current UK resale law from authoritative sources;
* document applicable legal requirements;
* store required face value/restriction/seat data;
* comply with applicable cancellation/blacklisting rules;
* support event-specific resale restrictions where lawful.
Do NOT hard-code a universal UK “face-value cap” unless current law actually requires it at deployment time.
Add legal-rule versioning.
 
⸻
 
56. TICKET PAYMENT PROTECTION
Audit:
* payment;
* cancellation;
* postponement;
* event cancellation;
* refunds;
* chargebacks;
* organizer settlement;
* resale settlement.
Product wording must accurately reflect actual Stripe/payment structure.
Do not call an arrangement “escrow” unless legally correct.
 
⸻
 
PART VIII — SUPPLIER / PROVIDER MARKETPLACE
57. PROVIDER VERIFICATION
Audit:
* account identity;
* Stripe Connect state;
* business details;
* payout capability;
* insurance;
* category documents;
* expiry;
* verification badges.
Search/profile must display accurate verification state only.
 
⸻
 
58. PROVIDER PROFILE
Enrich with:
* business description;
* categories;
* locations;
* travel radius;
* media;
* previous events;
* packages;
* pricing guidance;
* availability;
* response commitment;
* typical response;
* reliability;
* completed booking count;
* verified reviews;
* credentials;
* insurance status;
* cancellation terms;
* FAQs;
* team where public;
* emergency availability;
* standby availability.
 
⸻
 
59. PROVIDER BOOKING E2E
Test:
* discovery;
* enquiry;
* response deadline;
* quote;
* revision;
* conditional hold;
* booking;
* payment;
* confirmation;
* delivery;
* completion;
* review;
* payout;
* cancellation;
* dispute.
 
⸻
 
PART IX — VENUE / SPACE MARKETPLACE
60. VENUE PROFILE
Enrich with:
* venue;
* spaces;
* capacities;
* event types;
* map;
* layouts;
* gallery;
* video;
* address/map;
* accessibility;
* amenities;
* AV;
* food;
* bar;
* packages;
* min spend;
* hire rates;
* setup/teardown;
* availability;
* insurance/verification;
* licences where relevant;
* reviews;
* policies;
* transport;
* parking;
* accommodation where relevant;
* FAQs.
 
⸻
 
61. SPACE HIRE
Each space needs:
* capacity by layout;
* dimensions;
* fixed constraints;
* standing/seated;
* accessible capacity;
* floor/map;
* hire mode;
* packages;
* rate;
* availability;
* setup time;
* turnaround;
* operating restrictions.
Test multi-space bookings and conflicts.
 
⸻
 
62. VENUE ENQUIRY E2E
Test:
* enquiry;
* alternative date;
* alternative space;
* quote;
* hold;
* conditional hold;
* payment;
* deposit;
* BEO;
* final balance;
* settlement;
* cancellation;
* dispute.
 
⸻
 
PART X — PWA
63. MOBILE SHELL
Desktop sidebar must NOT be the PWA/mobile primary navigation.
Verify existing requirement:
* compact top bar;
* favicon/app mark, not full logo;
* contextual title;
* bottom-sheet app menu;
* safe areas;
* mobile-specific layout.
Organizer bottom-sheet menu:
* Home;
* Events;
* Calendar;
* Sales;
* Marketplace;
* Tickets & Promotion;
* Team;
* Money;
* Gala Agent;
* Settings.
Provider equivalent.
Customer uses consumer navigation.
 
⸻
 
64. PWA INSTALLABILITY
Audit:
* manifest;
* name;
* short name;
* icons;
* maskable icons;
* theme;
* start URL;
* service worker;
* update lifecycle;
* installability;
* offline shell;
* iOS metadata;
* Android behaviour.
Test actual install where test environment supports it.
 
⸻
 
65. OFFLINE CRITICAL FLOWS
Prioritise:
* ticket display;
* QR/barcode;
* event-day run sheet;
* check-in where architecture supports offline reconciliation;
* provider job details.
Never indicate a network write succeeded while offline until synchronised.
 
⸻
 
PART XI — QA & SECURITY
66. VIEWPORT MATRIX
Test at minimum:
Mobile:
* 320×568;
* 360×800;
* 375×812;
* 390×844;
* 393×852;
* 412×915;
* 430×932.
Tablet:
* 600×960;
* 768×1024;
* 800×1280;
* 820×1180;
* 1024×1366.
Laptop/Desktop:
* 1024×768;
* 1280×720;
* 1366×768;
* 1440×900;
* 1536×864;
* 1600×900;
* 1920×1080;
* large ultrawide sanity check.
Test portrait and landscape where meaningful.
 
⸻
 
67. TEXT / WRAP CHECK
Search for:
* clipped text;
* overflow;
* orphan headings;
* bad line wraps;
* horizontal scrolling;
* truncated currency;
* long venue names;
* long email addresses;
* long translations;
* broken tables;
* button label wrapping;
* overlapping chips.
Fix rather than hide.
 
⸻
 
68. ZOOM
Test browser zoom:
* 80%;
* 90%;
* 100%;
* 110%;
* 125%;
* 150%;
* 200% accessibility sanity.
Do not rely on pixel-fixed layouts.
 
⸻
 
69. TOUCH
Test:
* touch targets;
* drag/drop;
* drawers;
* menus;
* map;
* canvas;
* ticket scanner;
* sliders.
Avoid hover-only functionality.
 
⸻
 
70. WCAG
Target WCAG 2.2 AA.
Test:
* keyboard;
* focus;
* semantics;
* contrast;
* forms;
* errors;
* reduced motion;
* modals;
* drawers;
* tabs;
* canvas alternatives;
* maps;
* ticket selection.
 
⸻
 
71. SECURITY TESTING
Perform authorised application-level security assessment against the local/staging system.
Check:
* SQL injection;
* XSS;
* stored XSS;
* CSRF;
* SSRF;
* IDOR;
* broken access control;
* cross-tenant access;
* file upload attacks;
* path traversal;
* malicious SVG;
* ZIP bombs;
* webhook spoofing;
* OAuth state/nonce;
* session fixation;
* open redirect;
* rate-limit bypass;
* Agent prompt injection;
* GraphQL/API overexposure if applicable.
Do not perform destructive external attacks against third-party systems.
 
⸻
 
72. RATE LIMITS
Apply sensible rate limits to:
* auth;
* password/reset;
* OTP/MFA;
* ticket checkout;
* marketplace enquiry;
* messaging;
* search;
* public API;
* portal links;
* uploads;
* Agent requests;
* expensive exports.
Use account/user/workspace/IP/context appropriately rather than IP alone.
 
⸻
 
73. BOT & ABUSE CONTROLS
Add protection for:
* ticket inventory hoarding;
* repeated checkout;
* signup spam;
* referral abuse;
* promo abuse;
* fake reviews;
* marketplace enquiry spam;
* Agent resource abuse.
 
⸻
 
74. FILE MALWARE
All untrusted uploads:
* type validation;
* magic bytes;
* size limits;
* virus/malware scanning;
* sanitisation;
* quarantine;
* safe preview generation.
A failed/unavailable scanner should not silently publish an unscanned executable-risk file.
 
⸻
 
75. DEPENDENCY SECURITY
Run:
* dependency audit;
* vulnerable package review;
* secrets scan;
* source-code secret scan;
* outdated critical dependency review.
Fix release-critical findings.
 
⸻
 
PART XII — COMMUNICATIONS & AUTH
76. EMAIL ARCHITECTURE
Support professional connected mailboxes.
Preferred:
* Google OAuth;
* generic IMAP + SMTP.
POP support may exist only as a legacy optional retrieval adapter.
Do not make POP the recommended modern sync mechanism.
Transactional application mail remains separate.
 
⸻
 
77. TRANSACTIONAL EMAIL
Audit every event:
* registration;
* verification;
* password/security;
* booking;
* quote;
* payment;
* ticket;
* resale;
* refund;
* cancellation;
* portal;
* invitation;
* Agent approval;
* provider verification;
* document expiry.
Ensure:
* template;
* sender;
* unsubscribe handling where relevant;
* transactional/marketing separation;
* retry;
* bounce;
* complaint;
* delivery logging.
 
⸻
 
78. GOOGLE AUTH
Remove Microsoft login from new UI as requested.
Before removal:
* inspect existing Microsoft-linked users;
* provide migration/account-linking path;
* do not strand current users.
Implement Google OAuth/OIDC using Blackwellen’s own Google Cloud OAuth credentials and server-side OAuth flow.
Do not rely on a generic Supabase-hosted Google button flow if the requirement is direct Google configuration.
If Supabase remains the data/session authorization layer, integrate direct Google identity safely without breaking:
* RLS;
* user IDs;
* sessions;
* workspace memberships.
Validate:
* state;
* nonce;
* redirect URI;
* verified email;
* account linking.
 
⸻
 
79. MESSAGING
Test:
* user ↔ user;
* Customer ↔ Provider;
* Organizer ↔ Provider;
* portal messaging;
* group/event threads;
* attachments;
* notifications;
* unread count;
* moderation;
* blocked user;
* deleted membership.
Messages must maintain contextual link to:
* event;
* booking;
* opportunity;
* venue;
* supplier;
* support case.
 
⸻
 
80. NOTIFICATIONS
Build one normalized notification system.
Channels:
* in-app;
* email;
* push/PWA where supported;
* SMS/WhatsApp where explicitly configured.
Preferences by category.
Critical security notifications cannot simply be disabled.
Test deduplication.
 
⸻
 
81. SEARCH
Audit visible global search in:
* Organizer;
* Provider;
* Admin;
* Customer where relevant.
Search must be permission aware.
Support:
* events;
* contacts;
* venues;
* suppliers;
* services;
* bookings;
* opportunities;
* tickets;
* proposals;
* invoices;
* files.
No data leakage through search snippets.
 
⸻
 
82. WORKSPACE SWITCHER
Test:
* switching;
* persistence;
* default workspace;
* stale membership;
* revoked access;
* multiple tabs.
Never expose:
* Platform Admin;
* inaccessible workspaces.
 
⸻
 
83. ONBOARDING
Run every onboarding from clean user state.
Customer.
Organizer.
Provider:
* Venue;
* Supplier;
* Venue + Supplier.
Test:
* back;
* forward;
* save/resume;
* validation;
* abandoned onboarding;
* duplicate submission;
* completed state.
 
⸻
 
PART XIII — HELP, TOURS & DEMO DATA
84. HELP CENTRE
Produce full branded Help Centre content.
For each canonical page/section include:
* purpose;
* prerequisites;
* how to use;
* screenshots;
* callouts;
* workflows;
* troubleshooting;
* related pages.
Generate real screenshots from release UI using Playwright/browser automation.
Do not use stale mock screenshots.
 
⸻
 
85. SCREENSHOT ANNOTATION
Add annotations using deterministic screenshot overlays:
* arrow;
* highlight;
* numbered step;
* caption.
Store help screenshot version.
When UI materially changes, flag the guide as stale.
 
⸻
 
86. IN-PRODUCT GUIDED TOURS
Build branded contextual guided tours.
The Gala Dock favicon/avatar acts as the guide.
It must move and anchor to the relevant interface element, not sit permanently in the middle.
Tour engine supports:
* anchored bubble;
* arrow;
* focus spotlight;
* progress;
* Next;
* Back;
* Skip;
* finish;
* restart;
* resume.
Tours for:
* Customer;
* Organizer;
* Provider.
And important sections:
* Events;
* Marketplace;
* Tickets;
* Agent;
* Team;
* Money;
* Listings;
* Opportunities;
* Event Build;
* Map;
* Media Studio.
 
⸻
 
87. DEMO DATA
Do NOT mix fake demo data with production records in a live real workspace.
Create safe:
Demo Workspace / Demo Mode
From Settings:
Create Demo Workspace
Allow personas:
* Organizer demo;
* Venue demo;
* Supplier demo;
* Customer demo where appropriate.
Seed realistic:
* events;
* bookings;
* suppliers;
* venues;
* tickets;
* team;
* messages;
* money;
* Agent runs.
Provide:
Reset Demo Data
and
Delete Demo Workspace
Clearly mark all demo data.
 
⸻
 
PART XIV — PRIVACY, DSAR & ACCOUNT DELETION
88. SUBJECT ACCESS REQUESTS
Implement a Privacy Requests system.
User may create:
* Subject Access Request;
* Rectification Request;
* Erasure Request;
* Restriction Request;
* Data portability request where applicable;
* objection request where applicable.
Do not imply users must use the portal for a legally valid request.
Admin can also record requests received via:
* email;
* letter;
* verbal contact;
* support.
 
⸻
 
89. SAR WORKFLOW
States:
* Received;
* Identity Verification;
* Scoping;
* Data Collection;
* Review/Redaction;
* Ready;
* Delivered;
* Closed;
* Extended/Exception where lawful.
Record statutory deadline according to current law.
Do not hard-code outdated deadlines without legal-source review.
 
⸻
 
90. DATA EXPORT
Build data aggregation jobs.
Include applicable user personal data from:
* profile;
* events;
* bookings;
* tickets;
* messages;
* uploads;
* reviews;
* payments metadata;
* support;
* Agent history where personal data applies.
Redact other people’s data where required.
 
⸻
 
91. ACCOUNT DELETION
Implement request flow.
Do NOT blindly hard-delete:
* financial records;
* audit evidence;
* fraud evidence;
* legally retained booking records;
* records needed to fulfil outstanding contracts.
Implement:
* eligibility assessment;
* deletion;
* anonymisation;
* pseudonymisation;
* retention;
* restriction.
User receives status.
Admin can document legal basis for retained information.
 
⸻
 
PART XV — EXTERNAL PLATFORM INFRASTRUCTURE
92. CLOUDFLARE R2
Complete R2 integration.
Support:
* tenant-safe object prefixes;
* private objects;
* signed URLs;
* multipart upload;
* size limits;
* content type validation;
* secure CORS;
* derivative thumbnails;
* CDN policy;
* lifecycle rules;
* deletion;
* retention.
Categories:
* event media;
* design assets;
* provider documents;
* venue documents;
* ticket assets;
* help assets;
* exports.
Never make verification documents publicly accessible.
 
⸻
 
93. STRIPE
Complete sandbox + production configuration framework.
Audit:
* Stripe Connect;
* onboarding;
* verification;
* charges;
* transfers;
* application fees;
* refunds;
* disputes;
* subscriptions;
* AI credit packs;
* promotion/ads;
* tickets;
* resale;
* payouts;
* failed payments.
Use webhook state as authoritative.
Test idempotency.
 
⸻
 
94. MAPTILER / OPENSTREETMAP
Complete map infrastructure.
Support:
* venue discovery;
* supplier discovery;
* marketplace maps;
* venue location;
* event public map;
* provider service radius.
Respect required attribution.
Do not expose restricted keys unnecessarily.
Configure:
* server/client key separation;
* rate controls;
* geocoding;
* cache strategy;
* error fallback.
Internal venue/site-map editor is a different layer from geographical mapping.
 
⸻
 
PART XVI — API, MCP & WEBHOOK PLATFORM
95. DO NOT LITERALLY EXPOSE EVERY INTERNAL FUNCTION PUBLICLY
Instead create a comprehensive capability-scoped integration layer over the canonical domain services.
Every safe business capability can be exposed to:
* internal Agent;
* API;
* MCP;
* webhooks;
where appropriate.
Dangerous internal/admin functions remain private unless explicitly designed.
 
⸻
 
96. PUBLIC/WORKSPACE API
Build versioned API.
Example:
/api/v1/...
Domains:
* events;
* venues;
* spaces;
* services;
* marketplace requests;
* quotes;
* bookings;
* availability;
* tickets;
* guests;
* check-in;
* calendars;
* promotion;
* media;
* teams;
* invoices;
* Agent jobs where plan permits.
 
⸻
 
97. API AUTH
Support appropriately:
* workspace API key;
* OAuth application where needed.
API keys:
* hashed at rest;
* shown once;
* named;
* scoped;
* expiry;
* rotate;
* revoke;
* last-used.
Scopes examples:
events:read
events:write
tickets:read
tickets:scan
bookings:write
No giant universal key by default.
 
⸻
 
98. API SAFETY
Include:
* rate limits;
* idempotency keys;
* request IDs;
* pagination;
* filtering;
* typed errors;
* API versioning;
* audit logs.
Generate OpenAPI specification.
 
⸻
 
99. MCP SERVER
Implement a first-class Gala Dock MCP server over the same typed domain Tool Registry used by Gala Agent.
Expose tools according to:
* authenticated workspace;
* scopes;
* role;
* policy.
MCP must never bypass permissions.
Group tools:
* basic;
* medium;
* advanced;
* enterprise.
R4/R5 consequential actions preserve approval rules.
 
⸻
 
100. WEBHOOKS
Workspace integrations can subscribe to events.
Examples:
event.created
event.updated
booking.requested
booking.confirmed
booking.cancelled
quote.received
ticket.order.paid
ticket.transferred
ticket.resold
provider.document.expiring
payment.refunded
agent.run.completed
Implementation:
* HMAC signing;
* timestamp;
* event ID;
* retry;
* exponential backoff;
* delivery history;
* replay;
* endpoint disable after sustained failure;
* test delivery.
 
⸻
 
PART XVII — VENUE / SITE MAP BUILDER
101. COMPLETE MAP EDITOR AUDIT
Inventory every existing map feature.
Produce:
docs/maps/MAP_EDITOR_CAPABILITY_MATRIX.md
For each:
* implemented;
* partial;
* missing;
* broken;
* too heavy;
* redundant.
 
⸻
 
102. REQUIRED MAP FEATURES
Ensure functioning:
* zoom;
* pan;
* selection;
* multi-select;
* snap;
* grid;
* guides;
* rulers;
* layers;
* group;
* lock;
* hide;
* duplicate;
* rotation;
* resize;
* measurements;
* undo;
* redo;
* autosave;
* versions.
Assets:
* walls;
* rooms;
* doors;
* entrances;
* emergency exits;
* stairs;
* lifts;
* toilets;
* accessible toilets;
* bar;
* stage;
* seating;
* tables;
* booths;
* standing zones;
* queues;
* barriers;
* catering;
* kitchen;
* security;
* first aid;
* production;
* staff-only;
* vendor areas.
 
⸻
 
103. MAP MEDIA ELEMENT DETECTION
When supported media/layout imports are supplied:
* detect dimensions;
* detect orientation;
* allow imported floorplan as locked underlay;
* allow calibrated scale;
* create layers above it.
Do not claim computer-vision extraction exists unless actually implemented.
If automatic object detection is not genuinely reliable:
label it as:
Assistive detection / suggested elements
and require confirmation.
 
⸻
 
104. STRUCTURAL VS EVENT OVERLAY
Venue owns structural map.
Organizer owns event overlay.
Organizer cannot override locked:
* walls;
* fire exits;
* capacity;
* restricted zones;
* fixed venue assets.
 
⸻
 
105. PERFORMANCE
Avoid massive initial bundles.
Lazy-load editor.
Use:
* code splitting;
* virtualisation;
* efficient canvas rendering;
* cached assets;
* workers for heavy computation.
Map editor should not damage normal app performance.
 
⸻
 
PART XVIII — MEDIA CANVAS
106. MEDIA STUDIO FINAL AUDIT
Create:
docs/media/MEDIA_STUDIO_CAPABILITY_MATRIX.md
Audit:
* blank canvas;
* templates;
* fonts;
* uploads;
* image editing;
* layers;
* effects;
* shapes;
* drawing;
* masks;
* eraser;
* typography;
* widgets;
* QR;
* barcode;
* versioning;
* exports;
* community templates;
* Agent tools.
Fix all critical gaps.
 
⸻
 
107. MEDIA ELEMENT DETECTION
When imported artwork is flattened:
do NOT pretend original layers exist.
Allow:
* manual overlays;
* crop;
* colour;
* text;
* QR;
* logo;
* image adjustments.
Optional assistive detection may suggest:
* likely text regions;
* image regions;
* dominant colours;
* logo regions;
but must remain suggestions unless genuine editable source structure exists.
 
⸻
 
108. PERFORMANCE
Media editor should be lazy-loaded.
Use:
* thumbnails;
* preview resolutions;
* Web Workers;
* GPU/canvas acceleration;
* server-side high-quality export where needed.
Keep app shell lightweight.
 
⸻
 
PART XIX — ECONOMICS
109. CREATE ECONOMICS.MD
Create:
docs/commercial/economics.md
It must model:
* Organizer subscriptions;
* Provider subscriptions;
* AI credits;
* credit packs;
* storage;
* marketplace commission;
* venue commission;
* ticket fees;
* promotion/ads;
* payment-processing impact;
* support/infra variable costs.
 
⸻
 
110. 75% TARGET GROSS MARGIN
Commercial target:
75% gross margin / maximum approximately 25% variable cost
for subscription/AI products under expected usage.
Do not pretend all marketplace GMV is revenue.
For each plan calculate:
gross margin = (recognised platform revenue - variable cost to serve) / recognised platform revenue
Build:
* expected case;
* heavy-use case;
* abuse case.
Hard caps protect downside.
 
⸻
 
111. AZURE / AI COST MODEL
Do not hard-code obsolete Azure model pricing.
Research/configure currently applicable model prices at implementation time.
Maintain an internal model-pricing registry.
For each model estimate:
Simple Question
Input/output profile.
Medium Agent Task
Multiple tool calls.
Complex Mission
Planning + repeated reasoning + tools.
Long Mission
Persistent run with wake/resume.
Use these to calculate credit burn.
 
⸻
 
112. MODEL ROUTING ECONOMICS
Simple questions should not use expensive models unnecessarily.
Route by complexity.
Model:
* cost/question;
* cost/task;
* cost/mission;
* P50;
* P90;
* P99 expensive-use case.
Use pessimistic pricing when determining allowances.
 
⸻
 
113. SUBSCRIPTION TIERS
Create final proposed Organizer and Provider tiers.
Include:
* monthly/annual;
* active events;
* team;
* storage;
* AI credits;
* Agent features;
* API;
* advanced reporting;
* commission reduction where applicable.
Some low-cost/free plans can have:
* no Agent;
* very limited AI;
* pay-as-you-go packs.
Do not finalise pricing until competitor and cost review is recorded.
 
⸻
 
114. FEATURE GATING
Entitlements must come from server-side subscription plan configuration.
Do not scatter:
if plan === "pro"
through UI.
Use capabilities:
agent.long_runs
api.access
storage.gb
team.max
events.active.max
commission.rate
 
⸻
 
115. STORAGE
Include R2 storage allowance in each plan.
Meter:
* originals;
* design files;
* exports;
* videos;
* documents.
Allow grace before hard limit where appropriate.
 
⸻
 
116. COMPETITOR REVIEW
Research current competitor pricing at release time.
Record:
* source;
* date;
* plan;
* marketplace fee;
* ticket fee;
* venue/supplier fee;
* subscription;
* feature level.
Do not scrape prohibited/private sources.
Use public data.
 
⸻
 
PART XX — GALA DOCK PROMOTION / ADVERTISING
117. OWNED AD INVENTORY
Support placements:
* homepage;
* Discover;
* city;
* category;
* calendar;
* marketplace;
* venue profiles;
* related events;
* weekend spotlight;
* search prominence where policy permits.
Clearly label sponsored inventory.
 
⸻
 
118. PLACEMENT INVENTORY
Model:
* placement;
* dimensions;
* device;
* available dates;
* impression allocation;
* category;
* geography;
* base cost;
* pricing rule.
Prevent double booking of exclusive inventory.
 
⸻
 
119. TARGETING
Allow contextual targeting:
* location;
* event category;
* event date window;
* venue;
* audience event interests;
* broad device/session conditions where appropriate.
Do not introduce sensitive personal-data targeting without legal/privacy review.
 
⸻
 
120. CHARGING
Support:
* flat placement;
* duration;
* CPC where appropriate;
* CPM where appropriate;
* promoted listing fee.
Before purchase show:
* placement;
* duration;
* estimated reach if available;
* total cost;
* tax;
* cancellation/refund rule.
 
⸻
 
121. PROMOTION ANALYTICS
Track:
* impressions;
* unique impressions where feasible;
* clicks;
* event views;
* checkout starts;
* ticket purchases;
* attributable revenue.
Include bot/fraud filtering.
Do not guarantee conversions.
 
⸻
 
PART XXI — VIRTUAL / WEBINAR / AUDIO / HYBRID EVENTS
122. SUPPORT THESE EVENT TYPES NOW
Add first-class types:
* Webinar;
* Virtual Event;
* Live Audio;
* Podcast Live Recording;
* Hybrid Event;
* Remote Conference.
But:
DO NOT SELF-HOST REAL-TIME AUDIO/VIDEO IN V1.
 
⸻
 
123. WHY
Self-hosted media adds an entirely different operational layer:
* real-time bandwidth;
* TURN/STUN;
* transcoding;
* adaptive bitrate;
* recording;
* moderation;
* regional media routing;
* latency;
* capacity planning;
* abusive-content handling;
* recording consent;
* media retention;
* CDN expense.
It is unnecessary for the initial Gala Dock proposition.
 
⸻
 
124. VIRTUAL EVENT PROVIDER ADAPTERS
Build an abstraction:
VirtualEventProvider
Potential supported adapters can later include external meeting/stream platforms.
The canonical Gala Dock event should store:
* provider;
* external meeting/event ID;
* join URL;
* host URL/private host metadata;
* session ID;
* timezone;
* capacity;
* ticket requirement;
* access window;
* recording URL;
* replay availability.
Never expose host secrets to normal attendees.
 
⸻
 
125. VIRTUAL TICKET ACCESS
Ticket entitlement can control:
Join Event
Rules:
* only valid attendee;
* join opens within configured time window;
* revoked/refunded ticket loses access;
* transferred ticket follows new owner.
Do not rely only on a permanently public meeting link where provider integration can offer controlled access.
 
⸻
 
126. VIRTUAL PROGRAMME
Support:
* sessions;
* tracks;
* speaker profiles;
* moderators;
* breakouts;
* live/replay status;
* downloadable resources.
 
⸻
 
127. LIVE AUDIO / PODCAST EVENT
Support event metadata and ticketing for:
* live podcast;
* live audio show;
* recorded podcast taping.
For now:
* external audio/stream provider;
* external/live venue;
* recording metadata.
Do not build a Spotify/Clubhouse streaming platform during this release.
 
⸻
 
PART XXII — LEGAL DOCUMENT PACK
128. BLACKWELLEN LTD LEGAL DRAFTS
Create high-quality counsel-review drafts.
Do NOT label them “approved by a barrister”.
Use:
Draft for specialist UK legal review before production publication.
Do not invent:
* registered address;
* company number;
* VAT number;
* regulator details.
Use explicit placeholders where repository/company configuration does not contain verified data.
 
⸻
 
129. DOCUMENTS
Draft, as applicable:
1. Platform Terms of Service
2. Customer Terms
3. Organizer Terms
4. Provider Marketplace Terms
5. Venue Marketplace Terms
6. Ticket Purchase Terms
7. Official Ticket Resale Terms
8. Marketplace Payment Protection Terms
9. Cancellation & Refund Policy
10. Privacy Notice
11. Cookie Notice
12. Data Processing Addendum
13. Acceptable Use Policy
14. Community/Marketplace Standards
15. Content/Template Policy
16. Accessibility Statement
17. Safeguarding & Abuse Policy
18. Complaints Policy
19. Intellectual Property/Takedown Procedure
20. Affiliate/Partner Terms
21. Promoter Terms
22. AI/Gala Agent Terms & Disclosures.
Aim roughly 2,500–5,000 words per substantial legal document where the subject genuinely requires that depth.
Do not inflate a naturally short policy merely to hit a word count.
 
⸻
 
130. LEGAL SOURCE REGISTER
For every legal draft create:
* jurisdiction;
* authoritative sources consulted;
* date checked;
* assumptions;
* areas requiring solicitor/counsel confirmation.
Ticket resale law must be refreshed immediately before release.
 
⸻
 
131. COOKIE / PECR
Audit:
* analytics;
* marketing;
* advertising;
* embedded third parties;
* maps;
* videos;
* social.
Implement appropriate consent before non-essential trackers where required.
Record consent.
Support preference changes.
 
⸻
 
PART XXIII — BUSINESS CONTINUITY & OPERATIONS
132. BACKUPS
Verify:
* Supabase backup strategy;
* point-in-time recovery where plan supports;
* R2 backup/version strategy;
* configuration backups.
Document restore procedure.
A backup that has never been restore-tested is not release-ready.
 
⸻
 
133. RESTORE TEST
Perform safe staging restore/recovery validation where possible.
Record:
* RPO;
* RTO target;
* restore steps;
* responsible role.
 
⸻
 
134. DISASTER RECOVERY
Create:
docs/operations/DISASTER_RECOVERY.md
Cover:
* database outage;
* storage outage;
* Stripe outage;
* email outage;
* maps outage;
* AI outage;
* authentication outage.
Graceful degradation matters.
If AI is down, core booking/ticketing must continue.
 
⸻
 
135. INCIDENT RESPONSE
Create:
docs/security/INCIDENT_RESPONSE.md
Include:
* detection;
* severity;
* containment;
* investigation;
* evidence preservation;
* user notification decision;
* regulator decision;
* recovery;
* post-incident review.
 
⸻
 
136. OBSERVABILITY
Implement dashboards/alerts for:
* frontend failures;
* API errors;
* Supabase errors;
* RLS denials spike;
* webhook failure;
* ticket checkout failure;
* Stripe failure;
* Agent errors;
* queue backlog;
* email failure;
* calendar-sync failure;
* map failures;
* upload scan failures.
Use correlation IDs.
 
⸻
 
137. HEALTH DASHBOARD
Admin → Agent & Integrations / Settings should show service health:
* Supabase;
* R2;
* Stripe;
* Google OAuth;
* transactional email;
* IMAP/SMTP adapters;
* MapTiler;
* Agent model providers;
* Caption Fox integration if enabled;
* webhook queue.
Show:
* configured;
* healthy;
* degraded;
* failing;
* last successful call.
Never expose secret values.
 
⸻
 
PART XXIV — DATA & FRAUD GAPS
138. TAX / VAT
Audit:
* platform fees;
* subscriptions;
* promotions;
* AI packs;
* ticket fees;
* marketplace commission.
Keep tax logic configurable by jurisdiction.
Blackwellen Ltd’s actual verified VAT configuration must come from company settings.
Do not infer VAT registration identifiers.
Provider/customer tax obligations remain appropriately disclosed.
 
⸻
 
139. FRAUD / RISK
Build basic risk signalling around:
* unusual ticket purchasing;
* repeated chargebacks;
* rapid resale;
* marketplace spam;
* suspicious provider changes;
* payout detail changes;
* impossible location/logins;
* promotion fraud;
* referral abuse.
High-risk changes trigger review rather than invisible cancellation.
 
⸻
 
140. FINANCIAL RECONCILIATION
Daily/periodic reconciliation:
* internal payment record;
* Stripe PaymentIntent/Charge;
* refund;
* transfer;
* application fee;
* payout;
* dispute.
Identify discrepancies.
Never trust one database table as sole truth.
 
⸻
 
PART XXV — RELEASE TEST MATRIX
141. BUTTON TEST
Programmatically enumerate interactive controls where feasible.
Every visible:
* button;
* menu;
* link;
* tab;
* dropdown;
* checkbox;
* save;
* delete;
* export;
must either:
* perform real action;
* intentionally be disabled with explanation.
No dead controls.
 
⸻
 
142. E2E PERSONAS
Test:
Customer
* new customer;
* returning;
* ticket buyer;
* event builder.
Organizer
* owner;
* manager;
* finance;
* operational member.
Provider
* solo supplier;
* supplier team;
* single venue;
* multi-venue;
* venue + service.
External
* client portal;
* promoter;
* partner.
Admin
* support;
* trust/safety;
* finance;
* super admin.
 
⸻
 
143. PAYMENT E2E
Sandbox test:
* subscriptions;
* provider booking;
* venue booking;
* ticket;
* ticket resale;
* promotion;
* AI credit pack;
* refunds;
* dispute simulation where supported;
* payout state.
 
⸻
 
144. AGENT E2E
Provider:
* Ask;
* task;
* mission;
* routine;
* watch;
* event-triggered;
* long run;
* batch;
* approval.
Organizer:
same set.
Enforce live model cost caps defined above.
 
⸻
 
145. BROWSER MATRIX
At minimum test current mainstream:
* Chrome/Chromium;
* Safari/WebKit;
* Firefox.
Mobile:
* iOS Safari/PWA;
* Android Chromium/PWA simulation/real device where available.
 
⸻
 
PART XXVI — RELEASE ARTEFACTS
146. REQUIRED DOCUMENTS
Generate/update:
docs/release/RELEASE_READINESS_REPORT.md
docs/release/GO_LIVE_CHECKLIST.md
docs/release/KNOWN_LIMITATIONS.md
docs/release/EXTERNAL_CONFIGURATION.md
docs/security/SECURITY_ASSESSMENT.md
docs/security/INCIDENT_RESPONSE.md
docs/operations/DISASTER_RECOVERY.md
docs/commercial/economics.md
docs/agent/AGENT_TOOL_CATALOGUE.md
docs/agent/AGENT_SKILL_CATALOGUE.md
docs/agent/AGENT_PERMISSION_MATRIX.md
docs/api/openapi.yaml
docs/api/MCP_REFERENCE.md
docs/api/WEBHOOK_REFERENCE.md
docs/maps/MAP_EDITOR_CAPABILITY_MATRIX.md
docs/media/MEDIA_STUDIO_CAPABILITY_MATRIX.md
docs/legal/...
 
⸻
 
147. MIGRATION REPORT
Record:
* migrations added;
* backfills;
* indexes;
* potentially slow migrations;
* rollback steps.
No unreviewed destructive production migration.
 
⸻
 
148. RELEASE BLOCKERS
Anything in these categories blocks release:
* auth bypass;
* cross-tenant access;
* payment-state corruption;
* ticket oversell;
* stale ticket credential accepted;
* broken Stripe webhook;
* unprotected Admin;
* critical upload vulnerability;
* unrecoverable migration;
* broken core onboarding;
* broken booking checkout;
* broken Provider payout onboarding;
* severe WCAG navigation issue on core flows;
* Agent able to bypass approval/permissions;
* production secrets exposed;
* incorrect legal/payment claims.
 
⸻
 
149. NON-BLOCKING ITEMS
Clearly separate:
* polish;
* optional integrations;
* future streaming;
* minor animations;
* secondary reports;
* nice-to-have automation.
Do not block launch merely because future product ideas exist.
 
⸻
 
150. FINAL RELEASE VERDICT
At the end produce a concise verdict:
READY
All release blockers passed.
CONDITIONALLY READY
Software is release-ready but requires explicit listed:
* credentials;
* legal sign-off;
* production domain/configuration.
NOT READY
At least one real release blocker remains.
Never claim READY just because tests mostly passed.
 
⸻
 
FINAL PRODUCT STANDARD
When this release-readiness run is complete:
A Customer can:
* discover;
* build an event;
* request a venue;
* hire providers;
* make protected marketplace payments;
* buy tickets;
* sell tickets for eligible events;
* transfer;
* officially resell;
* manage their event;
* review providers.
An Organizer can:
* manage clients;
* sell events;
* build events;
* source venues/providers;
* use conditional holds;
* use standby;
* source emergencies;
* create venue maps;
* sell tickets;
* promote events;
* manage teams;
* manage operations;
* manage money;
* use Gala Agent for deep professional execution.
A Provider can:
* operate venues;
* operate services;
* list;
* find work;
* respond;
* quote;
* manage holds;
* manage spaces;
* manage menus/packages;
* manage teams;
* deliver bookings;
* receive payouts;
* use Gala Agent to operate the business.
Platform Admin can:
* operate the marketplace;
* administer commerce;
* manage Trust & Safety;
* investigate serious cases through controlled break-glass access;
* manage maintenance;
* manage integrations;
* oversee Agent systems;
* audit the platform.
Gala Agent supports:
Ask → Task → Mission → Routine → Watch → Event Trigger → Long Run → Batch → Approval → Completion
with:
* cost controls;
* credits;
* subscription gating;
* soft/hard caps;
* permissions;
* legal safeguards;
* injection defence;
* quality control;
* complete tool/skill hierarchy;
* durable state;
* audit.
And the platform is supported by:
* Stripe;
* Connect;
* Cloudflare R2;
* maps;
* email;
* Google authentication;
* API;
* MCP;
* webhooks;
* PWA;
* security controls;
* privacy tooling;
* disaster recovery;
* observability;
* complete help/tutorial infrastructure.
Do not finish by telling me what still needs to be implemented if it can be implemented during this run.
Implement it.
Test it.
Fix it.
Retest it.
Document it.
Only then produce the final release verdict.
