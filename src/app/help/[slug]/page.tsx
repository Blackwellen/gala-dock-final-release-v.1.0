import { notFound, redirect } from "next/navigation";
import { article } from "@/lib/help/articles";
import { HelpArticleView, SupportPanel } from "@/components/help/help-centre";
import { helpContext, helpFrom } from "@/lib/help/context";

export async function generateMetadata({ params }: PageProps<"/help/[slug]">) { const a = article((await params).slug); return { title: a ? `${a.title} · Help` : "Help" }; }

/** Help article (release spec §84–85): purpose, prerequisites, steps, a real annotated screenshot, troubleshooting, related guides. */
export default async function HelpArticlePage({ params, searchParams }: PageProps<"/help/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const a = article(slug); if (!a) notFound();
  if (a.slug !== slug) redirect(`/help/${a.slug}`);
  const ctx = await helpContext(helpFrom(sp.from));
  return <HelpArticleView base="/help" a={a} contact={<SupportPanel workspaceId={ctx.workspaceId} source={ctx.source} />} />;
}
