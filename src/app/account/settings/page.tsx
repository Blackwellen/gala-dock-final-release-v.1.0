import { Bell, ShieldCheck, UserRound } from "lucide-react";

const SECTIONS = [
  { title: "Profile", description: "Name, contact details and accessibility preferences.", icon: UserRound },
  { title: "Security", description: "Password, login methods and active sessions.", icon: ShieldCheck },
  { title: "Notifications", description: "Event, ticket and organiser update preferences.", icon: Bell },
];

export default function BuyerAccountSettingsPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-surface-900">Account</h1>
      <p className="mt-2 text-sm text-surface-600">Manage your buyer profile, security and notification preferences.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map(({ title, description, icon: Icon }) => <section key={title} className="rounded-xl border border-surface-200 bg-white p-5 shadow-card"><Icon className="h-5 w-5 text-brand-700" /><h2 className="mt-3 font-semibold text-surface-900">{title}</h2><p className="mt-1 text-sm leading-6 text-surface-600">{description}</p><span className="mt-4 inline-flex rounded-full bg-surface-100 px-2.5 py-1 text-xs font-medium text-surface-600">Account shell</span></section>)}
      </div>
    </section>
  );
}
