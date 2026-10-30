import { redirect } from "next/navigation";

/** One Help Centre (owner 2026-10-29): Organizer help lives at /help, with Organizer guides first and support tied to this workspace. */
export default async function Help({ searchParams }: PageProps<"/organizer/help">) {
  const sp = await searchParams, q = new URLSearchParams({ from: "organizer" });
  for (const k of ["q", "topic"] as const) if (typeof sp[k] === "string") q.set(k, sp[k]);
  redirect(`/help?${q}`);
}
