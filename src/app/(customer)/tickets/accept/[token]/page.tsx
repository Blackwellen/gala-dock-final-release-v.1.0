import type { Metadata } from "next";
import { getCustomer } from "@/lib/data/context";
import { AcceptTransfer } from "./accept";
import "@/styles/marketplace.css";

export const metadata: Metadata = { title: "Accept ticket · Gala Dock", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Recipient side of a two-step transfer (§49). The old ticket stops working only when this is accepted. */
export default async function AcceptTicketPage({ params }: PageProps<"/tickets/accept/[token]">) {
  const { token } = await params;
  const ctx = await getCustomer(`/tickets/accept/${token}`);
  return <main className="mk-page" style={{ maxWidth: 520, margin: "40px auto", padding: "0 16px" }}>
    <section className="mk-card" style={{ textAlign: "center", justifyItems: "center", padding: 28 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>You’ve been sent a ticket</h1>
      <p className="mk-note">Accepting issues a new ticket in your name ({ctx.user.email}). The sender’s copy stops working straight away.</p>
      <AcceptTransfer token={token} />
    </section>
  </main>;
}
