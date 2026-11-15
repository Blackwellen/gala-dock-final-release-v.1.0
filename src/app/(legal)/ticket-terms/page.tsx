import { LegalDocument, legalMetadata } from "@/components/legal/legal-document";

export const metadata = legalMetadata("ticket-terms");

export default function Page() {
  return <LegalDocument slug="ticket-terms" />;
}
