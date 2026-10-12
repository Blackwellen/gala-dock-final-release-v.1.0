import { notFound, redirect } from "next/navigation";
import { article } from "@/lib/help/articles";
import { HelpArticleView, SupportPanel } from "@/components/help/help-centre";
import { getOrganizer } from "@/lib/data/context";

export async function generateMetadata({ params }: PageProps<"/organizer/help/[slug]">) { const a = article((await params).slug); return { title: a ? `${a.title} · Help` : "Help" }; }

export default async function HelpArticlePage({ params }: PageProps<"/organizer/help/[slug]">) {
  const { slug } = await params;
  const a = article(slug); if (!a) notFound();
  if (a.slug !== slug) redirect(`/organizer/help/${a.slug}`);
  const wsId = (await getOrganizer("/organizer/help")).workspace.id;
  return <HelpArticleView base="/organizer/help" a={a} contact={<SupportPanel workspaceId={wsId} source="Organizer workspace" />} />;
}
