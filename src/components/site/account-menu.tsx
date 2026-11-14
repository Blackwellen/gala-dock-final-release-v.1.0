"use client";
/* eslint-disable @next/next/no-img-element -- the visitor's own avatar URL (any host) */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Bell, Briefcase, CalendarDays, ChevronDown, CircleHelp, Handshake, LogOut, MessagesSquare, Settings, ShieldCheck, Store, type LucideIcon } from "lucide-react";
import { buildAccountLinks, countLabel, nextMenuIndex, type AccountLink, type AccountLinkKey, type SiteAccount } from "./account-links";
import { trackPublic } from "./track";

/* Q69: the signed-in visitor's account menu in the one public header. Menu button pattern (WAI-ARIA APG): Enter/Space/↓ open on the
   first item, ↑ opens on the last, arrows wrap, Home/End, Escape closes and returns focus to the button, Tab closes and moves on,
   a click outside closes. On phones (≤640px) the trigger is hidden and AccountMenuPanel renders the same links inside the mobile menu. */

const ICON: Record<AccountLinkKey, LucideIcon> = {
  home: CalendarDays, organizer: Briefcase, provider: Store, partner: Handshake, admin: ShieldCheck,
  messages: MessagesSquare, notifications: Bell, settings: Settings, help: CircleHelp,
};

function Avatar({ account, size = 40 }: { account: SiteAccount; size?: number }) {
  return <span className="gp-avatar" aria-hidden="true">
    {account.avatar ? <img src={account.avatar} alt="" width={size} height={size} /> : <span>{account.initial}</span>}
  </span>;
}

function Extra({ link, account }: { link: AccountLink; account: SiteAccount }) {
  if (link.key === "messages" && account.unreadMessages) return <><i className="gp-acct-dot" aria-hidden="true" /><span className="gp-sr">, unread messages</span></>;
  if (link.key === "notifications") {
    const c = countLabel(account.notifications);
    return c ? <><b className="gp-acct-count" aria-hidden="true">{c}</b><span className="gp-sr">, {account.notifications} unread</span></> : null;
  }
  return null;
}

/** Menu items in DOM order (links + Sign out); queried from the open menu rather than held in render-time refs. */
const menuItems = (menu: HTMLElement | null) => (menu ? [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')] : []);

const attention = (a: SiteAccount) => a.unreadMessages || a.notifications > 0;

export function AccountMenu({ account }: { account: SiteAccount }) {
  const path = usePathname() ?? "/";
  // Open state remembers the path it was opened on, so a client-side navigation closes it without a state-syncing effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt !== null && openAt === path;
  const setOpen = useCallback((on: boolean) => setOpenAt(on ? path : null), [path]);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const pending = useRef<"first" | "last" | null>(null);
  const uid = useId();
  const btnId = `${uid}-btn`, menuId = `${uid}-menu`;
  const links = buildAccountLinks(account);

  const close = useCallback((refocus: boolean) => { setOpen(false); if (refocus) button.current?.focus(); }, [setOpen]);
  const show = (at: "first" | "last") => { pending.current = at; setOpen(true); trackPublic("public_nav_click", "header", "account_menu"); };

  // Focus lands on the requested item once the menu has rendered.
  useEffect(() => {
    if (!open || !pending.current) return;
    const items = menuItems(menu.current);
    items[pending.current === "first" ? 0 : items.length - 1]?.focus();
    pending.current = null;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open, setOpen]);

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); show(e.key === "ArrowDown" ? "first" : "last"); }
  };
  const onMenuKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "Escape") { e.preventDefault(); close(true); return; }
    if (e.key === "Tab") { setOpen(false); return; }
    const items = menuItems(menu.current);
    const next = nextMenuIndex(e.key, items.findIndex(el => el === document.activeElement), items.length);
    if (next === null) return;
    e.preventDefault();
    items[next]?.focus();
  };
  const pick = (key: string) => () => { trackPublic("public_nav_click", "account_menu", key); setOpen(false); };

  return <div className="gp-acct" ref={root}>
    <button ref={button} id={btnId} type="button" className="gp-acct-btn" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      aria-label={`Account menu for ${account.name}${attention(account) ? ", you have unread items" : ""}`}
      onClick={() => (open ? close(false) : show("first"))} onKeyDown={onButtonKey}>
      <Avatar account={account} />
      {attention(account) && <i className="gp-acct-badge" aria-hidden="true" />}
      <ChevronDown size={16} className="gp-acct-chev" aria-hidden="true" />
    </button>
    {open && <div className="gp-acct-pop">
      <div className="gp-acct-who">
        <Avatar account={account} />
        <span><b>{account.name}</b>{account.email && <small>{account.email}</small>}</span>
      </div>
      <ul ref={menu} role="menu" id={menuId} aria-labelledby={btnId} onKeyDown={onMenuKey}>
        {links.map((l, n) => {
          const Icon = ICON[l.key];
          const sep = n > 0 && links[n - 1]!.group !== l.group;
          return <li key={l.key} role="none" className={sep ? "is-sep" : undefined}>
            <Link role="menuitem" tabIndex={-1} href={l.href} className="gp-acct-item" onClick={pick(l.key)}>
              <Icon size={18} aria-hidden="true" /><span className="gp-acct-label">{l.label}</span><Extra link={l} account={account} />
            </Link>
          </li>;
        })}
        <li role="none" className="is-sep">
          <form action="/auth/signout" method="post">
            <button role="menuitem" tabIndex={-1} type="submit" className="gp-acct-item" onClick={() => trackPublic("public_nav_click", "account_menu", "sign_out")}>
              <LogOut size={18} aria-hidden="true" /><span className="gp-acct-label">Sign out</span>
            </button>
          </form>
        </li>
      </ul>
    </div>}
  </div>;
}

/** Phone layout: the same account links as a plain list inside the public mobile menu (a dialog, so no menu roles here). */
export function AccountMenuPanel({ account, onNavigate }: { account: SiteAccount; onNavigate: () => void }) {
  const links = buildAccountLinks(account);
  return <section className="gp-acct-panel" aria-label="Your account">
    <div className="gp-acct-who">
      <Avatar account={account} />
      <span><b>{account.name}</b>{account.email && <small>{account.email}</small>}</span>
    </div>
    <ul className="gp-acct-list">
      {links.map(l => {
        const Icon = ICON[l.key];
        return <li key={l.key}><Link href={l.href} className="gp-acct-item" onClick={() => { trackPublic("public_nav_click", "menu_account", l.key); onNavigate(); }}>
          <Icon size={18} aria-hidden="true" /><span className="gp-acct-label">{l.label}</span><Extra link={l} account={account} />
        </Link></li>;
      })}
      <li><form action="/auth/signout" method="post">
        <button type="submit" className="gp-acct-item" onClick={() => trackPublic("public_nav_click", "menu_account", "sign_out")}><LogOut size={18} aria-hidden="true" /><span className="gp-acct-label">Sign out</span></button>
      </form></li>
    </ul>
  </section>;
}
