import { LegalDocument, legalMetadata } from "@/components/legal/legal-document";

export const metadata = legalMetadata("data-retention");

export default function Page() {
  return <LegalDocument slug="data-retention" />;
}
