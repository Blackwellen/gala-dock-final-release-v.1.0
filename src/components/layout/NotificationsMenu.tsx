"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, AlertTriangle, Info, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/shell/actions";
import type { ShellNotification } from "@/lib/shell/data";

const SEVERITY_ICON: Record<string, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  critical: XCircle,
};

const SEVERITY_COLOR: Record<string, string> = {
  info: "text-info-500",
  success: "text-success-500",
  warning: "text-warning-500",
  error: "text-danger-500",
  critical: "text-danger-600",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function NotificationsMenu({
  notifications,
  unreadCount,
}: {
  notifications: ShellNotification[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function openItem(n: ShellNotification) {
    if (!n.read) startTransition(() => void markNotificationRead(n.id));
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-900 transition-colors"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell className="w-4.5 h-4.5" strokeWidth={1.8} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 flex items-center justify-center text-[9px] font-semibold text-white bg-brand-600 rounded-full border-2 border-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-surface-200 shadow-dropdown z-50 animate-scale-in overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100">
              <p className="text-sm font-semibold text-surface-900">Notifications</p>
              {unreadCount > 0 && (
                <button
                  onClick={() => startTransition(() => void markAllNotificationsRead())}
                  className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Bell className="w-7 h-7 text-surface-300 mx-auto mb-2" strokeWidth={1.5} />
                  <p className="text-sm text-surface-500">You're all caught up</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const Icon = SEVERITY_ICON[n.severity] ?? Info;
                  const color = SEVERITY_COLOR[n.severity] ?? "text-surface-400";
                  return (
                    <button
                      key={n.id}
                      onClick={() => openItem(n)}
                      className={cn(
                        "w-full text-left flex gap-3 px-4 py-3 border-b border-surface-50 hover:bg-surface-50 transition-colors",
                        !n.read && "bg-brand-50/40"
                      )}
                    >
                      <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", color)} strokeWidth={1.8} />
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm truncate", n.read ? "text-surface-700" : "text-surface-900 font-medium")}>
                          {n.title}
                        </p>
                        {n.body && <p className="text-xs text-surface-500 line-clamp-2 mt-0.5">{n.body}</p>}
                        <p className="text-[10px] text-surface-400 mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-brand-600 mt-1.5 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>

            <a
              href="/event-manager/settings/notifications"
              className="block px-4 py-2.5 text-center text-xs font-medium text-surface-600 hover:text-brand-600 hover:bg-surface-50 border-t border-surface-100 transition-colors"
            >
              Notification settings
            </a>
          </div>
        </>
      )}
    </div>
  );
}
