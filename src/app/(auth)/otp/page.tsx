import { Suspense } from "react";
import OtpForm from "./otp-form";

export const dynamic = "force-dynamic";

export default function OtpPage() {
  return (
    <Suspense>
      <OtpForm />
    </Suspense>
  );
}
