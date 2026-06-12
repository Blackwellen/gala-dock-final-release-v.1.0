import { Suspense } from "react";
import AcceptInviteForm from "./accept-invite-form";

export const dynamic = "force-dynamic";

export default function AcceptInvitePage() {
  return (
    <Suspense>
      <AcceptInviteForm />
    </Suspense>
  );
}
