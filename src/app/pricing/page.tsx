import { redirect } from "next/navigation";

/** /pricing is a shareable address for the live pricing section on the landing page. */
export default function PricingPage() {
  redirect("/#pricing");
}
