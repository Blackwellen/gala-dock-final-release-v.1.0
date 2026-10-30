import { redirect } from "next/navigation";

/** One Help Centre (owner 2026-10-29): Provider help lives at /help, with Provider guides first and support tied to this workspace. */
export default async function Help({ searchParams }: PageProps<"/provider/help">) {
  const sp = await searchParams, q = new URLSearchParams({ from: "provider" });
  for (const k of ["q", "topic"] as const) if (typeof sp[k] === "string") q.set(k, sp[k]);
  redirect(`/help?${q}`);
}
