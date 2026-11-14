import Link from "next/link";
import { Info } from "lucide-react";
import { CONNECT_COPY } from "@/lib/payments/connect-countries";

/** Shown above the booking-mode radios when the workspace's business country is enquiry-only (see lib/provider/seller-country). */
export function EnquiryOnlyNote({ country }: { country: string }) {
  return <p className="vw-info" role="note"><Info aria-hidden="true" /><span><b>Enquiry only in {country}</b><br />{CONNECT_COPY.listingFallback} <Link href={CONNECT_COPY.helpPath}>Where you can get paid</Link></span></p>;
}
