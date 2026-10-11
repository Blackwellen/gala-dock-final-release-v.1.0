Part 2

56. AGENT MEDIA SKILLS
Build internal skills:
Poster Builder
Given Event + selected media:
* choose appropriate template;
* populate event details;
* place existing artwork;
* create hierarchy;
* add ticket CTA;
* add QR;
* apply brand;
* produce draft.
Ticket Launch Graphic
Generate from existing Event/ticket data and existing visual assets.
Sold-Out Graphic
Final Tickets Graphic
Event Information Poster
Venue Signage
Event Schedule Graphic
Sponsor Board
Multi-Format Reflow
Convert selected design into:
* social square;
* story;
* display screen;
* print poster.
Again:
Agent creates layouts.
Agent does not synthesize photos.
 
⸻
 
57. AGENT MEDIA APPROVAL
Agent-generated media remains Draft until approved/published where relevant.
User can:
* open in editor;
* edit;
* approve;
* export;
* publish.
Never allow autonomous public publishing unless Agent policy explicitly permits that action.
 
⸻
 
58. VENUE / EVENT MAP AGENT TOOLS
Extend Gala Agent into the map engine.
Read tools:
* get_venue_map;
* get_map_version;
* list_map_objects;
* inspect_space_constraints;
* get_event_overlay;
* get_ticket_inventory_map;
* get_capacity_summary;
* validate_map.
Mutation tools:
* create_event_overlay;
* add_map_object;
* update_map_object;
* remove_map_object;
* duplicate_map_object;
* group_map_objects;
* lock_map_object where authorised;
* assign_ticket_section;
* assign_ticket_tier;
* block_seat;
* unblock_seat;
* add_table;
* add_seats;
* add_stage;
* add_bar;
* add_security_position;
* add_checkin_position;
* add_vendor_area;
* add_operational_zone.
Agent may never override Venue structural locks.
 
⸻
 
59. MAP AGENT SKILLS
Build:
Seating Layout Builder
Given:
* venue;
* event type;
* capacity target;
* stage position;
* accessibility requirements.
Create a draft event overlay.
Table Plan Builder
For:
* wedding;
* gala;
* dinner.
Generate suggested tables/seating using existing venue geometry.
Do not automatically assign sensitive guest relationships without user-provided grouping logic.
Ticket Section Builder
Create:
* GA;
* VIP;
* Premium;
* Accessible;
* Tables.
Bind proposed inventory.
Operational Layout Builder
Place suggested:
* check-in;
* security;
* first aid;
* production;
* vendor zones;
* bars.
Map Validation
Detect:
* blocked exit;
* accessibility issue;
* exceeded capacity;
* overlapping objects;
* unsafe ticket section;
* structural conflict.
All map-changing Agent actions create a Draft map version first unless policy allows immediate safe edits.
 
⸻
 
60. PWA NAVIGATION — REMOVE DESKTOP SIDEBAR
The current PWA/mobile navigation is wrong.
Do not show the desktop sidebar as the primary mobile menu.
For installed PWA/mobile widths:
remove/collapse normal sidebar entirely.
Use a dedicated app navigation pattern.
 
⸻
 
61. PWA TOP BAR
Mobile/PWA top bar must be compact.
Do not show the full Gala Dock wordmark.
Use the Gala Dock favicon/app icon mark.
Recommended layout:
Left: contextual back button or menu trigger where needed.
Centre: Gala Dock favicon/app mark or current page/event title depending context.
Right: notifications/avatar/context action.
Do not waste mobile horizontal space on the full desktop logo.
The favicon must use the canonical brand asset already in the project.
Do not create a different logo.
 
⸻
 
62. PWA APP MENU
Primary navigation opens as a bottom sheet / bottom drawer.
Do not open the desktop left sidebar.
Trigger:
* app/menu button in mobile shell;
* optionally persistent bottom navigation where appropriate.
Opening menu should slide upward from the bottom.
Use:
* rounded upper corners;
* drag handle;
* accessible close;
* backdrop;
* swipe down to dismiss where practical;
* keyboard/focus support.
 
⸻
 
63. PWA ORGANIZER MENU
PWA Organizer menu contains:
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
Use icons.
Show useful state badges.
Examples:
* Marketplace 4;
* Team 2;
* Gala Agent 3 running;
* Money £2.4k due.
Do not copy desktop width/spacing into this sheet.
 
⸻
 
64. PWA PROVIDER MENU
Provider:
* Home;
* Opportunities;
* Bookings;
* Calendar;
* Listings;
* Team;
* Money;
* Gala Agent;
* Settings.
Capabilities adapt Listings content.
 
⸻
 
65. PWA CUSTOMER NAVIGATION
Customer PWA remains consumer focused.
Primary nav:
* Discover;
* Plan;
* My Events;
* My Tickets;
* Saved.
Use a compact bottom navigation for the most-used items if appropriate.
Additional account functions live inside app-menu sheet.
Do not convert Customer into a business sidebar.
 
⸻
 
66. PWA SUBPAGES
Every existing and new page must be tested under the PWA shell.
Including:
* records;
* tabs;
* wizards;
* media editor;
* map viewer;
* ticket wallet;
* ticket detail;
* booking detail;
* Agent;
* approval screens;
* communications;
* settings.
No page may silently fall back to an unusable desktop sidebar.
 
⸻
 
67. PWA SAFE AREA
Support iOS/Android safe areas.
Respect:
* notch;
* Dynamic Island;
* bottom home indicator;
* keyboard;
* viewport resize.
Use CSS safe-area env variables.
Bottom sheets/nav must never be hidden behind device UI.
 
⸻
 
68. PWA OFFLINE STATE
Relevant offline-safe surfaces:
* purchased tickets;
* QR/barcodes;
* event-day run sheet where possible;
* cached event details;
* scanner workflow according to existing offline strategy.
Display explicit offline state.
Never imply network mutations succeeded until synchronised.
 
⸻
 
69. TICKET CREDENTIAL MODES
Every valid ticket must support configurable presentation formats.
At minimum:
QR Ticket
Standard Visual Ticket
Barcode Ticket
These are presentation/credential options around the same canonical ticket entitlement.
Do not create three unrelated ticket records.
 
⸻
 
70. QR TICKET
QR ticket view should include:
* event artwork;
* event name;
* date;
* time;
* venue;
* ticket holder;
* tier;
* section;
* row;
* seat where relevant;
* order reference;
* QR credential;
* wallet/save option where supported;
* ticket rules;
* transfer/resale status.
QR should be large enough to scan reliably.
 
⸻
 
71. STANDARD VISUAL TICKET
Create a polished visual ticket style.
Can resemble a premium digital admission ticket.
Sections can include:
Left / Main
* event branding;
* artwork;
* event name;
* date;
* venue.
Credential area
* ticket number;
* attendee;
* tier;
* section/seat;
* compact QR or barcode depending configuration.
Support portrait and landscape presentations.
This format is primarily for:
* visual wallet;
* PDF;
* print;
* sharing preview where permitted.
Do not expose a usable credential in insecure public previews.
 
⸻
 
72. BARCODE TICKET
Support barcode credential presentation where required.
Supported symbologies should be chosen based on scanner compatibility.
Potentially include:
* Code 128;
* another approved supported format.
Do not implement a dozen barcode types without need.
Barcode screen includes:
* barcode;
* human-readable reference;
* event;
* attendee/tier;
* venue;
* seat.
 
⸻
 
73. TICKET CREDENTIAL SECURITY
QR/barcode must represent secure server-managed ticket entitlement.
Do not use simple predictable:
ticket_id=12345
inside credentials.
Use secure opaque identifiers/tokens.
Validate server-side.
Support:
* active;
* transferred;
* resale_locked;
* resold;
* refunded;
* revoked;
* scanned.
Only active entitlement should admit.
 
⸻
 
74. TRANSFER
When transferred:
* old credential becomes invalid;
* recipient gets new credential;
* old visual ticket displays transferred/inactive state;
* scanner rejects old credential.
 
⸻
 
75. RESALE
When ticket enters official resale:
* credential should be locked from ordinary admission where policy requires;
* old ticket cannot remain simultaneously usable;
* after resale, invalidate old entitlement;
* issue new credential to purchaser.
 
⸻
 
76. TICKET DISPLAY SELECTOR
Organizer may set preferred default display style:
* QR;
* Visual;
* Barcode.
Where security/compatibility permits, buyer can switch presentation without changing entitlement.
Example:
Display as: QR | Ticket | Barcode
This changes view, not ticket identity.
 
⸻
 
77. TICKET WALLET
Customer:
/account/tickets
Each ticket card:
* artwork;
* event;
* date;
* venue;
* tier;
* status.
Open ticket → selected credential view.
Support:
* transfer;
* official resale;
* event info;
* venue directions;
* add calendar;
* share safe event link.
Never allow screenshot-share mechanisms to bypass ticket transfer security.
 
⸻
 
78. SCANNER COMPATIBILITY
Check-in PWA must scan:
* Gala QR;
* Gala barcode formats.
Scanner screen:
* live camera;
* manual search;
* manual reference;
* recent scans;
* duplicate warning;
* entry status.
Return:
* Valid;
* Already Scanned;
* Invalid;
* Refunded;
* Transferred;
* Resold;
* Revoked;
* Wrong Event;
* Wrong Date/Session.
 
⸻
 
79. PRINTABLE TICKETS
Allow printable PDF ticket when organizer policy permits.
Include:
* visual event information;
* secure QR/barcode;
* terms;
* seat information;
* order reference.
Do not compromise credential security simply to support print.
 
⸻
 
80. DESIGN SYSTEM CONSISTENCY
All new experiences must use Gala Dock’s established enterprise visual language.
Do not create a Canva clone visually.
Media Studio should feel like Gala Dock Studio.
PWA should feel like a native Gala Dock application.
Tickets should feel premium and brand-led.
Maps should feel like the same product.
Agent must appear integrated, not bolted on.
 
⸻
 
81. RELEASE-READY CROSS-INTEGRATIONS
Ensure:
Media Studio ↔ Event
Media Studio ↔ Tickets & Promotion
Media Studio ↔ Public Page
Media Studio ↔ Event Calendar Promotion
Media Studio ↔ Gala Agent
Venue Map ↔ Venue
Venue Map ↔ Event Overlay
Event Map ↔ Tickets
Event Map ↔ Operations
Event Map ↔ Gala Agent
Tickets ↔ Customer Wallet
Tickets ↔ Transfer
Tickets ↔ Resale
Tickets ↔ Scanner
Tickets ↔ Event Map
PWA Shell ↔ every mobile route
No disconnected duplicates.
 
⸻
 
82. DATABASE / PERSISTENCE
Add/extend canonical models for:
* designs;
* design_pages;
* design_layers;
* design_versions;
* design_assets;
* design_shares;
* template_publications;
* template_reports;
* brand_assets;
* uploaded_fonts;
* ticket_display_preferences;
* ticket_credentials where existing model requires;
* map Agent drafts where existing map versioning does not already cover it.
Do not duplicate existing equivalent tables.
Audit current schema first.
 
⸻
 
83. RLS
Protect:
* private designs;
* event designs;
* workspace designs;
* brand kits;
* custom fonts;
* unpublished templates;
* ticket credentials;
* map drafts;
* exports.
Public community templates expose only intended public fields/assets.
Ticket credential token data must not become generally queryable from client-side tables.
 
⸻
 
84. AUDIT LOGGING
Audit:
* template publish;
* template unpublish;
* asset upload;
* public share;
* design export;
* Agent design creation;
* Agent map modification;
* ticket credential regenerate/revoke;
* transfer;
* resale;
* scanner state-changing actions.
 
⸻
 
85. TESTING — MEDIA
Test:
* blank create;
* template create;
* layer add;
* layer move;
* text styling;
* fonts;
* crop;
* filter;
* shadow;
* glow;
* blend;
* mask;
* erase;
* drawing;
* resize;
* undo;
* redo;
* autosave;
* version restore;
* export;
* public template;
* malicious upload;
* invalid SVG;
* huge image;
* permission isolation.
 
⸻
 
86. TESTING — AGENT MEDIA
Test:
Create an A3 ticket-launch poster for Event X using the existing hero image, organizer branding and ticket QR.
Agent should:
1. read event;
2. fetch existing media;
3. fetch brand kit;
4. create design draft;
5. add text;
6. place image;
7. add QR;
8. add ticket CTA;
9. save;
10. return editable design.
It must NOT call nonexistent image generation.
 
⸻
 
87. TESTING — AGENT MAP
Test:
Create a seated comedy layout for 300 people using the Main Hall map, stage at the north wall, one central aisle, accessible seating near the entrance and Premium seating in the front four rows.
Agent should:
1. read structural map;
2. read venue constraints;
3. create event overlay draft;
4. place stage if permitted;
5. place seating;
6. create aisles;
7. reserve accessible inventory;
8. create Premium section;
9. validate;
10. return warnings;
11. require review before publishing.
 
⸻
 
88. TESTING — PWA
Test on realistic mobile viewports.
Verify:
* desktop sidebar absent;
* bottom app menu works;
* favicon/compact brand header correct;
* safe area;
* drawer keyboard focus;
* menus route correctly;
* all pages can be reached;
* back navigation works;
* modal stacking works;
* keyboard does not obscure inputs.
 
⸻
 
89. TESTING — TICKETS
Test:
* QR ticket;
* visual ticket;
* barcode ticket;
* switching display;
* scan;
* duplicate scan;
* transfer;
* official resale;
* refund;
* revocation;
* offline cached display;
* print.
Verify old credentials become unusable after relevant ownership/status transitions.
 
⸻
 
90. PERFORMANCE REQUIREMENTS
The editor must not freeze under normal professional designs.
Stress test:
* many layers;
* large uploaded images;
* multi-page designs;
* effects;
* zoom/pan;
* undo history.
Optimise large media.
Use preview resolutions while editing where appropriate.
Use full-resolution originals for final export where appropriate.
 
⸻
 
91. SECURITY REVIEW
Pen-test:
* SVG injection;
* malicious template upload;
* cross-workspace asset access;
* public template exposure;
* ticket-token enumeration;
* stale ticket credential reuse;
* Agent privilege escalation;
* map structural override;
* shared design permission bypass;
* stored XSS in text layers;
* filename injection;
* unsafe export names.
 
⸻
 
92. FINAL ACCEPTANCE
This implementation is not complete until:
A professional Organizer can open an Event, start from a blank canvas or template, create a polished event poster using hundreds of licensed fonts, images, shapes, layers, drawing, crop, shadows, glow, masks, effects and QR widgets, save versions, export it and optionally share the template publicly.
A user can upload finished artwork and simply add event-specific information or use it unchanged.
A public community template can be safely copied by another user without exposing the creator’s private event data.
Uploaded media/templates are validated and scanned.
Gala Agent can create and modify layouts using existing assets but does not pretend to generate new imagery.
Gala Agent can also draft and edit Event Map overlays through typed, permissioned tools.
Mobile/PWA no longer uses the desktop sidebar and instead has a purpose-built compact app shell with a bottom-sheet menu and favicon-based branding.
Every ticket can render securely as:
QR | Visual Ticket | Barcode
while retaining one canonical entitlement and automatically invalidating stale credentials after transfer, resale, refund or revocation.
The entire feature set must be:
production ready, secure, responsive, cross-integrated, audited, tested and visually consistent with Gala Dock.


