import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { retrieveSession } from "@/lib/stripe";
import { fulfilBoard } from "../../actions";

export const dynamic = "force-dynamic";

export default async function BuildSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { eventId } = await params;
  const sp = await searchParams;
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : null;

  let confirmed = false;
  if (sessionId) {
    const session = await retrieveSession(sessionId);
    if (session && session.paymentStatus === "paid") {
      const result = await fulfilBoard(eventId);
      confirmed = result.confirmed;
    }
  }

  return (
    <div className="bg-surface-50 min-h-[calc(100vh-64px)]">
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <div className="rounded-2xl border border-surface-200 bg-white p-8">
          {confirmed ? (
            <>
              <CheckCircle2 className="mx-auto w-12 h-12 text-success-600" />
              <h1 className="mt-4 text-xl font-bold text-surface-900">You&apos;re all set! 🎉</h1>
              <p className="mt-2 text-sm text-surface-600">
                Your payment was successful and every supplier has been confirmed. Check your email
                for details — we&apos;ll be in touch with a run sheet before the big day.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-flex px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700"
              >
                Create an account to track it
              </Link>
            </>
          ) : (
            <>
              <XCircle className="mx-auto w-12 h-12 text-surface-400" />
              <h1 className="mt-4 text-xl font-bold text-surface-900">Payment not confirmed</h1>
              <p className="mt-2 text-sm text-surface-600">
                We couldn&apos;t confirm this payment yet. If you were charged, your booking will follow shortly.
              </p>
              <Link
                href={`/build/${eventId}`}
                className="mt-6 inline-flex px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700"
              >
                Back to your event
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
