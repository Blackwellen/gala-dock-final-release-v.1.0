"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, CircleHelp, Command, Menu, Search, Settings2 } from "lucide-react";
import { GALA_DEMO_USER, GALA_DEMO_WORKSPACES, getGalaDemoWorkspace, type GalaWorkspaceType } from "@/mock-data/gala-dock/workspaces";
import { getWorkspaceShellNav } from "@/lib/nav/workspace-shell-nav";
import { cn } from "@/lib/utils";
import { switchWorkspace } from "@/lib/shell/actions";

function prettify(value: string) {
  return value
    .split("/")
    .filter(Boolean)
    .map((part) => part.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()))
    .join(" · ") || "Home";
}

function workspaceRoute(type: GalaWorkspaceType, workspaceId: string, path = "home") {
  return `/${type}/${path}?workspace=${workspaceId}`;
}

function primaryCreatePath(type: GalaWorkspaceType) {
  if (type === "venue") return "my-venues/new";
  if (type === "supplier") return "jobs/new";
  return "events/new";
}

/**
 * The canonical workspace shell. Every type has its own route root and unique
 * information architecture; all child links are path-backed rather than a
 * generic /app URL or a query-param-only view.
 */
export function WorkspaceTypeShell({ type, path }: { type: GalaWorkspaceType; path: string[] }) {
  const pathname = usePathname();
  const query = useSearchParams();
  const workspace = getGalaDemoWorkspace(type, query.get("workspace"));
  const nav = getWorkspaceShellNav(type, workspace.subtype);
  const activePath = path.join("/") || "home";

  return (
    <div className="min-h-screen bg-surface-100 p-3 sm:p-4">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1800px] gap-3 sm:gap-4">
        <aside className="hidden w-72 shrink-0 flex-col overflow-hidden rounded-2xl border border-sidebar-border bg-gradient-to-b from-[#2c1b68] via-[#211556] to-[#17103f] shadow-shell-sidebar lg:flex">
          <div className="border-b border-sidebar-border px-5 py-5">
            <p className="text-lg font-semibold text-white">Gala Dock</p>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-sidebar-muted">{type} workspace</p>
          </div>
          <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
            {nav.map((group) => (
              <section key={group.label}>
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">{group.label}</p>
                {group.items.map((entry) => {
                  const active = activePath === entry.href || activePath.startsWith(`${entry.href}/`);
                  const Icon = entry.icon;
                  return (
                    <div key={entry.id}>
                      <Link href={workspaceRoute(type, workspace.id, entry.href)} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium", active ? "bg-brand-600 text-white shadow-[0_4px_20px_-4px_rgba(109,69,255,0.55)]" : "text-sidebar-text hover:bg-sidebar-hover hover:text-white")}>
                        <Icon className="h-4.5 w-4.5" />
                        <span className="flex-1 truncate">{entry.label}</span>
                        {entry.children && <ChevronDown className="h-3.5 w-3.5 opacity-70" />}
                      </Link>
                      {active && entry.children && (
                        <div className="ml-5 mt-1 space-y-0.5 border-l border-white/15 pl-3">
                          {entry.children.map((child) => (
                            <Link key={child.href} href={workspaceRoute(type, workspace.id, child.href)} className="block rounded-md px-2 py-1.5 text-xs text-sidebar-muted hover:bg-sidebar-hover hover:text-white">
                              {child.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            ))}
          </nav>
          <div className="border-t border-sidebar-border p-3">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-2 text-left">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">JT</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-white">{workspace.name}</span><span className="block truncate text-[10px] text-sidebar-muted">{workspace.subscription} · demo</span></span>
                <ChevronDown className="h-4 w-4 text-sidebar-muted" />
              </summary>
              <div className="mt-2 max-h-56 space-y-1 overflow-auto">
                {GALA_DEMO_WORKSPACES.map((candidate) => (
                  <form key={candidate.id} action={switchWorkspace.bind(null, candidate.id)}>
                    <button type="submit" className="block w-full rounded-md px-3 py-2 text-left text-xs text-sidebar-text hover:bg-sidebar-hover hover:text-white">
                      {candidate.name}<span className="mt-0.5 block text-[10px] text-sidebar-muted">{candidate.type} · {candidate.subtype.replaceAll("-", " ")}</span>
                    </button>
                  </form>
                ))}
              </div>
            </details>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="flex h-14 items-center gap-3 rounded-2xl border border-surface-200 bg-white px-4 shadow-shell-topbar">
            <button aria-label="Open navigation" className="rounded-lg p-2 text-surface-600 hover:bg-surface-100 lg:hidden"><Menu className="h-5 w-5" /></button>
            <div className="hidden items-center gap-2 text-sm text-surface-500 sm:flex"><span>Gala Dock</span><span>/</span><span className="font-medium text-surface-800">{type}</span><span>/</span><span>{prettify(activePath)}</span></div>
            <div className="ml-auto flex items-center gap-1">
              <button aria-label="Search" className="rounded-lg p-2 text-surface-600 hover:bg-surface-100"><Search className="h-4.5 w-4.5" /></button>
              <button aria-label="Command palette" className="hidden rounded-lg p-2 text-surface-600 hover:bg-surface-100 sm:block"><Command className="h-4.5 w-4.5" /></button>
              <Link href={workspaceRoute(type, workspace.id, "settings")} aria-label="Settings" className="rounded-lg p-2 text-surface-600 hover:bg-surface-100"><Settings2 className="h-4.5 w-4.5" /></Link>
              <Link href="/help" aria-label="Help" className="rounded-lg p-2 text-surface-600 hover:bg-surface-100"><CircleHelp className="h-4.5 w-4.5" /></Link>
            </div>
          </header>
          <main className="mt-3 min-h-[calc(100vh-6rem)] rounded-2xl border border-surface-200 bg-surface-50 p-5 shadow-card sm:p-6">
            <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 text-sm text-brand-900"><strong>Development shell mode</strong><span className="ml-2">Signed in as {GALA_DEMO_USER.email}. This fixture is local-only and never runs in production.</span></div>
            <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row"><div><p className="text-sm font-medium text-brand-700">{workspace.subtype.replaceAll("-", " ")}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-surface-900">{prettify(activePath)}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-surface-600">{workspace.contextLabel}. This route-backed shell reserves the correct place for the planned {prettify(activePath).toLowerCase()} workflow.</p></div><Link href={workspaceRoute(type, workspace.id, primaryCreatePath(type))} className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">Create / add</Link></div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">{["Overview & KPIs", "Operational records", "Tasks, approvals & activity"].map((title, index) => <section key={title} className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-surface-400">{index + 1}</p><h2 className="mt-2 font-semibold text-surface-900">{title}</h2><p className="mt-2 text-sm leading-6 text-surface-600">A responsive structural area for the future data, actions, filters, states and role-aware controls belonging to this page.</p></section>)}</div>
            <section className="mt-5 rounded-xl border border-dashed border-surface-300 bg-white p-6"><h2 className="font-semibold text-surface-900">Route-backed workspace shell</h2><p className="mt-2 text-sm leading-6 text-surface-600">Use the side menu to move through each unique workspace area. Detail pages and nested tabs can use the same URL after the workspace type, without returning to a generic /app namespace.</p><p className="mt-3 font-mono text-xs text-surface-500">{pathname}</p></section>
          </main>
        </div>
      </div>
    </div>
  );
}
