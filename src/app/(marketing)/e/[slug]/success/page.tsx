import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { retrieveSession } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// V1.5 15-4: checkout success + fulfilment. Confirms the Stripe session, then (idempotently) marks
// the order paid and increments ticket_types.sold via service-role. (A webhook makes this atomic
// once STRIPE_WEBHOOK_SECRET is configured.)
export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : null;

  let confirmed = false;
  if (sessionId) {
    const session = await retrieveSession(sessionId);
    if (session && session.paymentStatus === "paid") {
      const admin = createAdminClient();
      const { data: order } = await admin
        .from("ticket_orders")
        .select("id, status, ticket_type_id, quantity")
        .eq("stripe_session_id", sessionId)
        .maybeSingle();
      if (order?.status === "pending") {
        await admin.from("ticket_orders").update({ status: "paid", updated_at: new Date().toISOString() }).eq("id", order.id);
        const { data: tt } = await admin.from("ticket_types").select("sold").eq("id", order.ticket_type_id).maybeSingle();
        if (tt) await admin.from("ticket_types").update({ sold: (tt.sold ?? 0) + order.quantity }).eq("id", order.ticket_type_id);
        confirmed = true;
      } else if (order?.status === "paid") {
        confirmed = true;
      }
    }
  }

  return (
    <div className="bg-surface-50">
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <div className="rounded-2xl border border-surface-200 bg-white p-8">
          {confirmed ? (
            <>
              <CheckCircle2 className="mx-auto w-12 h-12 text-success-600" />
              <h1 className="mt-4 text-xl font-bold text-surface-900">You're in! 🎉</h1>
              <p className="mt-2 text-sm text-surface-600">Your payment was successful and your tickets are confirmed. Check your email for details.</p>
            </>
          ) : (
            <>
              <XCircle className="mx-auto w-12 h-12 text-surface-400" />
              <h1 className="mt-4 text-xl font-bold text-surface-900">Payment not confirmed</h1>
              <p className="mt-2 text-sm text-surface-600">We couldn't confirm this payment yet. If you were charged, your tickets will follow shortly.</p>
            </>
          )}
          <Link href={`/e/${slug}`} className="mt-6 inline-flex px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700">
            Back to event
          </Link>
        </div>
      </div>
    </div>
  );
}
