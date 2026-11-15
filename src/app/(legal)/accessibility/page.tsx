import { LegalDocument, legalMetadata } from "@/components/legal/legal-document";

export const metadata = legalMetadata("accessibility");

export default function Page() {
  return <LegalDocument slug="accessibility" />;
}
