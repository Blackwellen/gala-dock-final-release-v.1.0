import { Suspense } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Sign in", template: "%s | Gala Dock" },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-white">
      <Suspense>{children}</Suspense>
    </div>
  );
}
