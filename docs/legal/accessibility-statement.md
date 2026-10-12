# Accessibility Statement

> **Approved for publication by Jamahl Thomas, Director, Blackwellen Limited, 12 October 2026.** Version 2026-10. Conformance status below reflects the internal WCAG 2.2 AA audit of 12 October 2026 (docs/compliance/wcag-audit.md); an independent audit is still recommended before production launch.

Blackwellen Limited wants as many people as possible to be able to use Gala Dock: the website, the installable app (PWA), digital tickets, and the tools organisers and providers use. This statement covers galadock.com and its sub-pages.

## What you should be able to do

* Zoom to 200% without loss of content, and up to 400% with content reflowing to a single column on most pages.
* Navigate with a keyboard alone, with a visible focus indicator.
* Use a screen reader (NVDA, JAWS, VoiceOver, TalkBack) for core journeys: finding events, buying tickets, showing a ticket, booking and paying a provider, messaging, and account settings.
* Use the site at 320px width without horizontal scrolling.
* Respect your system's reduced-motion and dark-mode preferences where supported.
* Show your ticket as a QR code, a visual pass or a barcode where the organiser allows, and print it.

## How accessible this website is

We test against **WCAG 2.2 level AA**. This website is **partially compliant**, because of the exceptions listed below. Testing during the October 2026 release included:
* an automated axe-core audit of all 79 main routes: 72 pass with no violations, and the rest are listed below;
* a 390px mobile audit of all 79 main routes (one navigation per breakpoint, no horizontal scroll);
* keyboard and focus checks on core flows;
* text and touch-target sizing.

**Known issues:**
* The **Media Studio** design canvas and the **venue map builder** rely on pointer drag for positioning. Keyboard alternatives exist for moving selected elements (arrow keys) and editing properties through form fields, but complex layout is harder without a pointer.
* Some **charts** in analytics pages don't yet have full text alternatives; the underlying numbers are shown in nearby tables.
* **Third-party content:** event images and descriptions uploaded by organisers may lack alt text or captions.
* **Map pins** on Discover, Plan and the organiser Marketplace are smaller than 24px. Every pin has the same item in the list beside the map, which you can use instead.
* The **check-in scanner** needs a camera. Manual code entry is available as an alternative.

## Feedback and alternative formats

If you need information in a different format, find a barrier, or need help buying a ticket or booking, contact support@galadock.com or use Help in the app. We aim to reply within 5 working days. Organisers are responsible for the accessibility of their events and venues, and event pages show the access information they provide.

## Enforcement

If you're not happy with our response, you can contact the Equality Advisory and Support Service (EASS).

## Preparation of this statement

Prepared on 11 October 2026 and last reviewed on 12 October 2026, after an internal WCAG 2.2 AA audit. A full independent audit will be scheduled before production launch, and this statement will be updated with its date and findings.
