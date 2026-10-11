import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { untyped } from "@/lib/workspace/db";
import { PAYMENT_STATE } from "@/lib/commerce/orchestrator";
import { reconcilePaymentOrder } from "@/lib/commerce/reconcile";
import { money } from "@/lib/format";
import { RefreshWhilePending } from "./refresh";
import "@/styles/marketplace.css";

export const metadata = { title: "Payment" };

/** Post-checkout status. Never assumes success from the redirect (§43): state comes from Stripe — via the webhook or a server-side session check on return. */
export default async function PaymentStatusPage({ params, searchParams }: PageProps<"/payments/[ref]">) {
  const [{ ref }, sp] = await Promise.all([params, searchParams]);
  if (!/^PO-[A-Z0-9]{8}$/.test(ref)) notFound();
  const ctx = await getCustomer(`/payments/${ref}`);
  // Verify with Stripe on return (server-side, idempotent) so confirmation doesn't depend on webhook delivery timing.
  await reconcilePaymentOrder(ref, ctx.user.id);
  const { data: po } = await untyped(ctx.supabase as never).from("payment_orders").select("reference,status,description,amount_minor,currency,failure_reason").eq("reference", ref).maybeSingle();
  if (!po) notFound();
  const back = typeof sp.back === "string" && sp.back.startsWith("/") && !sp.back.startsWith("//") ? sp.back : "/account/events";
  const pending = ["amount_due", "payment_pending"].includes(po.status), failed = po.status === "failed";
  const [label, tone] = PAYMENT_STATE[po.status] ?? [po.status, "grey"];
  const Icon = pending ? Clock : failed ? XCircle : CheckCircle2;
  return <main className="mk-page" style={{ margin: "48px auto", padding: "0 16px", maxWidth: 560 }}>
    <section className="mk-card" aria-live="polite" style={{ textAlign: "center", justifyItems: "center", padding: 28 }}>
      <Icon size={40} aria-hidden="true" color={pending ? "#e27a00" : failed ? "#e8233c" : "#0f8a4e"} />
      <h1 style={{ fontSize: 22, margin: 0 }}>{pending ? "Confirming your payment…" : failed ? "Payment not completed" : "Payment received"}</h1>
      <p className="mk-note">{po.description} · {money(po.amount_minor / 100, po.currency)}</p>
      <span className={`mk-tag ${tone}`}>{label}</span>
      <p className="mk-note">{pending ? "We confirm payments with Stripe directly. This usually takes a few seconds — this page updates automatically."
        : failed ? "You haven’t been charged. You can try again from your booking." : "Your payment is protected until the service is delivered, then released to the provider."}</p>
      <p className="mk-note">Reference {po.reference}</p>
      <Link className="mk-btn primary" href={back}>Back to your booking</Link>
      {pending && <RefreshWhilePending />}
    </section>
  </main>;
}
