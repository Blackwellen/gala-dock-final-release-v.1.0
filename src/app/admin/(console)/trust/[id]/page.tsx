import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/lib/workspace/db";

/** Deep link used by the Admin alert bell: opens the case in the Trust & Safety review panel. */
export default async function TrustCaseLink(props: PageProps<"/admin/trust/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  redirect(`/admin/trust?case=${id}`);
}
