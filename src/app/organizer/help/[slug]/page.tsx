import { redirect } from "next/navigation";

/** One Help Centre (owner 2026-10-29): articles live at /help/[slug]. */
export default async function HelpArticle({ params }: PageProps<"/organizer/help/[slug]">) {
  redirect(`/help/${encodeURIComponent((await params).slug)}?from=organizer`);
}
