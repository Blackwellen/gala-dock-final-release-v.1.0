import { notFound, redirect } from "next/navigation";
import { article } from "@/lib/help/articles";
import { HelpArticleView, SupportPanel } from "@/components/help/help-centre";
import { getProvider } from "@/lib/provider/context";

export async function generateMetadata({ params }: PageProps<"/provider/help/[slug]">) { const a = article((await params).slug); return { title: a ? `${a.title} · Help` : "Help" }; }

export default async function HelpArticlePage({ params }: PageProps<"/provider/help/[slug]">) {
  const { slug } = await params;
  const a = article(slug); if (!a) notFound();
  if (a.slug !== slug) redirect(`/provider/help/${a.slug}`);
  const wsId = (await getProvider()).workspace.id;
  return <HelpArticleView base="/provider/help" a={a} contact={<SupportPanel workspaceId={wsId} source="Provider workspace" />} />;
}
