import { createClient } from "@/lib/supabase/server";
import { enabledProviders } from "@/lib/calendar-sync/providers";
import { CalendarConnect, type CalendarSyncState } from "@/components/customer/account-client";

/** Calendar connect list with two-way sync where Google / Microsoft OAuth is configured; ICS subscription otherwise. */
export async function CalendarConnectSection({ returnTo }: { returnTo: string }) {
  const providers = enabledProviders();
  let connections: CalendarSyncState["connections"] = [];
  if (providers.length) {
    const { data } = await (await createClient()).rpc("my_calendar_connections");
    connections = (data ?? []) as CalendarSyncState["connections"];
  }
  return <CalendarConnect sync={{ providers, connections, returnTo }} />;
}
