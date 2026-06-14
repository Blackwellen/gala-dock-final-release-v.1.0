import { CheckCircle2, XCircle, PartyPopper } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Check In", robots: { index: false } };
// Public, token-based, mutates on load — always render dynamically.
export const dynamic = "force-dynamic";

const DATETIME_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  day: "numeric",
  month: "short",
});

export default async function PublicCheckInPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Service-role client: this PUBLIC page has no authenticated session.
  const supabase = createAdminClient();

  const { data: guest } = await supabase
    .from("event_guests")
    .select("id, first_name, last_name, checked_in_at, event_id, table_number")
    .eq("check_in_token", token)
    .maybeSingle();

  if (!guest) {
    return (
      <Shell>
        <Card
          tone="neutral"
          icon={<XCircle className="h-12 w-12 text-surface-400" />}
          title="Check-in link not recognised"
          body="This link is invalid or has expired. Please see a member of the event team."
        />
      </Shell>
    );
  }

  // Look up the event name (best-effort) for a friendlier confirmation.
  const { data: event } = await supabase
    .from("events")
    .select("name")
    .eq("id", guest.event_id)
    .maybeSingle();
  const eventName = event?.name ?? null;

  const firstName = guest.first_name?.trim() || "there";

  // Already checked in.
  if (guest.checked_in_at) {
    return (
      <Shell>
        <Card
          tone="success"
          icon={<CheckCircle2 className="h-12 w-12 text-success-600" />}
          title={`You're already checked in, ${firstName}.`}
          body={
            <>
              Checked in at{" "}
              <strong>{DATETIME_FMT.format(new Date(guest.checked_in_at))}</strong>
              {eventName ? <> for {eventName}.</> : "."}
              {guest.table_number && <> Your table is {guest.table_number}.</>}
            </>
          }
        />
      </Shell>
    );
  }

  // First arrival — mark checked in and confirm RSVP.
  const now = new Date().toISOString();
  await supabase
    .from("event_guests")
    .update({ checked_in_at: now, rsvp_status: "confirmed" })
    .eq("id", guest.id);

  return (
    <Shell>
      <Card
        tone="success"
        icon={<PartyPopper className="h-12 w-12 text-success-600" />}
        title={`Welcome, ${firstName}!`}
        body={
          <>
            You&rsquo;re checked in{eventName ? <> for {eventName}</> : ""}.
            {guest.table_number && (
              <>
                {" "}
                Your table is <strong>{guest.table_number}</strong>.
              </>
            )}
          </>
        }
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="text-lg font-bold tracking-tight text-brand-700">Gala Dock</span>
        </div>
        {children}
      </div>
    </main>
  );
}

function Card({
  tone,
  icon,
  title,
  body,
}: {
  tone: "success" | "neutral";
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}) {
  const border =
    tone === "success" ? "border-success-200" : "border-surface-200";
  return (
    <div
      className={`rounded-2xl border ${border} bg-white p-8 text-center shadow-card`}
    >
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center">
        {icon}
      </div>
      <h1 className="text-xl font-semibold text-surface-900">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-surface-600">{body}</p>
    </div>
  );
}
