import { LegalDocument, legalMetadata } from "@/components/legal/legal-document";
import { CookieSettingsButton } from "@/components/shared/cookie-banner";

export const metadata = legalMetadata("cookies");

/** The policy says the choice can be changed at any time from this page (consent must be as easy to withdraw as to give), so the
 *  control that reopens the cookie banner sits right after the document. */
export default function Page() {
  return <>
    <LegalDocument slug="cookies" />
    <p className="lg-consent"><CookieSettingsButton /></p>
  </>;
}
