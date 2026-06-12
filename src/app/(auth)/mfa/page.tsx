import { Suspense } from "react";
import MfaForm from "./mfa-form";

export const dynamic = "force-dynamic";

export default function MfaPage() {
  return (
    <Suspense>
      <MfaForm />
    </Suspense>
  );
}
