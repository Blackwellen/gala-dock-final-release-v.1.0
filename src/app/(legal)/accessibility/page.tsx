import Link from "next/link";
import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Accessibility Statement · Gala Dock", description: "How accessible Gala Dock is, the known issues, and how to report a problem." };

/**
 * Accessibility statement (UK public-sector model structure, adapted for a private company; blueprint §10).
 * DRAFT FOR OWNER REVIEW (2026-11-11): every claim below comes from Gala Dock's own audits — see docs/compliance/wcag-audit.md
 * (axe-core run of 12 October 2026) and docs/release/backend-queue.md (W10/W12 regressions). Update the dates and the known-issues
 * list after the pre-launch phone/tablet sweep (playbook §3) and any independent audit. Do not add claims that no audit supports.
 */
const DRAFT = true;
const PREPARED = "11 November 2026";
const LAST_AUDIT = "12 October 2026";

export default function AccessibilityStatement() {
  return <article>
    <h1>Accessibility Statement</h1>
    {DRAFT && <p className="lg-meta" role="note"><b>Draft for owner review.</b> This statement has not been approved for publication yet.</p>}
    <p className="lg-meta">Prepared {PREPARED} · last automated audit {LAST_AUDIT} · Blackwellen Limited</p>

    <p>Blackwellen Limited runs Gala Dock. We want as many people as possible to be able to use it: the website, the installable app, digital tickets, and the tools organisers, venues and suppliers use. This statement covers galadock.com and the pages and app screens under it.</p>

    <h2>What you should be able to do</h2>
    <p>Our own testing shows you should be able to:</p>
    <ul>
      <li>use the main pages on a phone 390 pixels wide without scrolling sideways;</li>
      <li>move through the core journeys with a keyboard (discover an event, check out, show a ticket; plan, book and pay a provider; create and publish an event), with a visible focus indicator;</li>
      <li>read text and status colours that meet the WCAG contrast minimum on the routes we audited.</li>
    </ul>
    <p>We have not yet completed screen-reader or 400% zoom testing; until we have, we don’t claim them.</p>

    <h2>How accessible Gala Dock is</h2>
    <p>Our target is the <a href="https://www.w3.org/TR/WCAG22/">Web Content Accessibility Guidelines (WCAG) 2.2</a> at level AA. Gala Dock is <b>partially compliant</b> with that standard, because of the known issues listed below.</p>
    <p>Our last full automated check (axe-core, WCAG 2.2 A and AA rules) covered the 79 main customer, organiser and public routes on {LAST_AUDIT}. After fixes, 75 of the 79 routes had no automated violations; the other 4 fail only on map-pin target size, explained below. Pages built or changed since then have not all been re-checked yet. Automated tools find only some problems, and we have not yet had an independent audit.</p>

    <h2>Known issues</h2>
    <ul>
      <li><b>Map pins</b> on Discover, Plan and the organiser Marketplace are smaller than the 24 by 24 pixel target size (WCAG 2.5.8). Every pin has the same item in the list beside the map, which you can use instead.</li>
      <li><b>Design canvas and venue map builder.</b> Positioning items relies on dragging with a pointer (WCAG 2.5.7). Selected items can be moved with the arrow keys and edited through form fields, but complex layouts are harder without a pointer.</li>
      <li><b>Charts</b> on some analytics pages don’t have full text alternatives yet (WCAG 1.1.1). The numbers are shown in nearby tables or figures.</li>
      <li><b>Content from organisers and providers</b>, such as event images and descriptions, may lack alt text or captions. We ask for alt text on upload, but we can’t check every item.</li>
      <li><b>Ticket scanning</b> at the door needs a camera. Staff can enter the ticket code by hand instead.</li>
      <li><b>Phone and tablet layouts</b> in the organiser and provider workspaces are still being checked at every screen size in portrait and landscape. Report anything you find and we will fix it.</li>
    </ul>

    <h2>Reporting a problem or asking for another format</h2>
    <p>If you find a barrier, need information in a different format (such as large print or plain text), or need help buying a ticket or booking, email <a href={`mailto:${LEGAL.contact.support}`}>{LEGAL.contact.support}</a> or use <Link href="/help">Help</Link>. Tell us the page address and what went wrong. We aim to reply within 5 working days.</p>
    <p>Organisers and venues are responsible for the accessibility of their events and premises. Event pages show the access information the organiser provides; ask the organiser if you need more.</p>

    <h2>Enforcement</h2>
    <p>Under the Equality Act 2010, we must make reasonable adjustments for disabled people. If you aren’t happy with how we respond to your complaint, you can contact the <a href="https://www.equalityadvisoryservice.com/">Equality Advisory and Support Service (EASS)</a>. In Northern Ireland, contact the <a href="https://www.equalityni.org/">Equality Commission for Northern Ireland</a>.</p>

    <h2>What we are doing to improve accessibility</h2>
    <ul>
      <li>Before launch: a full phone and tablet check (portrait and landscape) of every signed-in workspace, with automated accessibility checks on each screen.</li>
      <li>Larger touch targets for map pins, or a keyboard-friendly alternative on the map itself.</li>
      <li>Text summaries for every chart.</li>
      <li>An independent WCAG 2.2 AA audit, after which this statement will be updated.</li>
    </ul>

    <h2>Preparation of this statement</h2>
    <p>This statement was prepared on {PREPARED}. It is based on our own testing: an automated axe-core audit of the main routes on {LAST_AUDIT}, a 390-pixel mobile check of the same routes, and keyboard and focus checks of the core journeys. We will review it after each major release and at least once a year.</p>
    <p>Contact: <a href={`mailto:${LEGAL.contact.support}`}>{LEGAL.contact.support}</a>.</p>
  </article>;
}
