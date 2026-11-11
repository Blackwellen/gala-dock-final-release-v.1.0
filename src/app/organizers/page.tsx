import { permanentRedirect } from "next/navigation";

/** /organizers has no index (organiser profiles live at /organizers/[id]); the public organiser proposition is /organisers. */
export default function OrganizersIndex() {
  permanentRedirect("/organisers");
}
