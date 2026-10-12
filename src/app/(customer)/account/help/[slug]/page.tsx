import { notFound, redirect } from "next/navigation";
import { article } from "@/lib/help/articles";
import { HelpArticleView, SupportPanel } from "@/components/help/help-centre";


export async function generateMetadata({ params }: PageProps<"/account/help/[slug]">) { const a = article((await params).slug); return { title: a ? `${a.title} · Help` : "Help" }; }

export default async function HelpArticlePage({ params }: PageProps<"/account/help/[slug]">) {
  const { slug } = await params;
  const a = article(slug); if (!a) notFound();
  if (a.slug !== slug) redirect(`/account/help/${a.slug}`);
  const wsId = null;
  return <HelpArticleView base="/account/help" a={a} contact={<SupportPanel workspaceId={wsId} source="Customer account" />} />;
}
