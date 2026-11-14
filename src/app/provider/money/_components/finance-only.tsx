import Link from "next/link";
import { Lock } from "lucide-react";

/** Q49: Money (ledger, statements, exports) is for owners, managers and finance — the same rule as RLS on transactions and the mobile menu. */
export function FinanceOnly() {
  return <div className="pm">
    <header className="ws-page-head pm-head"><div><h1>Money</h1><p>Earnings, fees, payouts and statements for this workspace.</p></div></header>
    <section className="ws-panel pm-locked" role="status"><Lock aria-hidden="true" />
      <p>Only workspace owners, managers and finance can see Money. Ask an owner to change your role in <Link href="/provider/settings?tab=team">Settings › Team &amp; Access</Link>.</p></section>
  </div>;
}
