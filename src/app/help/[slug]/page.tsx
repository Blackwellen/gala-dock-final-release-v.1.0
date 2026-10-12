import { notFound, redirect } from "next/navigation";
import { article } from "@/lib/help/articles";
import { HelpArticleView, SupportPanel } from "@/components/help/help-centre";

export async function generateMetadata({ params }: PageProps<"/help/[slug]">) { const a = article((await params).slug); return { title: a ? `${a.title} · Help` : "Help" }; }

/** Help article (release spec §84–85): purpose, prerequisites, steps, a real annotated screenshot, troubleshooting, related guides. */
export default async function HelpArticlePage({ params }: PageProps<"/help/[slug]">) {
  const { slug } = await params;
  const a = article(slug); if (!a) notFound();
  if (a.slug !== slug) redirect(`/help/${a.slug}`);
  return <HelpArticleView base="/help" a={a} contact={<SupportPanel source="Help Centre" />} />;
}
