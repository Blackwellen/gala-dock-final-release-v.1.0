import Link from "next/link";
import "@/styles/kit.css";
import "@/styles/customer.css";
import "@/styles/pub-directory.css";
import { KitProviders } from "@/components/kit/client";
import { PublicHeader } from "@/components/customer/public-header";
import { SiteFooter } from "@/components/public/site-footer";

/** App-wide 404 (unknown URLs and notFound() outside a layout with its own chrome): the shared public header and footer. */
export default function NotFound() {
  return <KitProviders><div className="c-root k-root pub-root"><PublicHeader />
    <main className="c-main pub-main" id="main"><section className="ce-card" style={{ maxWidth: 640, margin: "48px auto", textAlign: "center" }}>
      <h1 style={{ margin: 0, fontSize: 28 }}>Page not found</h1>
      <p className="k-muted" style={{ margin: "10px 0 20px" }}>The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <div className="k-row" style={{ gap: 10, justifyContent: "center", flexWrap: "wrap" }}><Link className="k-btn primary" href="/events">Browse events</Link><Link className="k-btn outline" href="/help">Help Centre</Link></div>
    </section></main>
    <SiteFooter /></div></KitProviders>;
}
