import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { Plus, MessageSquare, Mail, Phone, Send, CheckCircle2, Clock, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

const CHANNEL_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  email:    { bg: "bg-blue-100",    text: "text-blue-700",    icon: <Mail className="h-3.5 w-3.5" /> },
  sms:      { bg: "bg-green-100",   text: "text-green-700",   icon: <Phone className="h-3.5 w-3.5" /> },
  whatsapp: { bg: "bg-teal-100",    text: "text-teal-700",    icon: <MessageSquare className="h-3.5 w-3.5" /> },
  in_app:   { bg: "bg-violet-100",  text: "text-violet-700",  icon: <MessageSquare className="h-3.5 w-3.5" /> },
  portal:   { bg: "bg-amber-100",   text: "text-amber-700",   icon: <MessageSquare className="h-3.5 w-3.5" /> },
};

const MSG_STATUS: Record<string, string> = {
  sent:     "bg-success-100 text-success-700 border-success-200",
  pending:  "bg-warning-100 text-warning-700 border-warning-200",
  failed:   "bg-danger-100 text-danger-700 border-danger-200",
  draft:    "bg-surface-100 text-surface-500 border-surface-200",
  read:     "bg-blue-100 text-blue-700 border-blue-200",
};

import React from "react";

interface CommsMessage {
  id: string;
  subject: string | null;
  channel: string | null;
  recipient_name: string | null;
  recipient_type: string | null;
  status: string | null;
  sent_at: string | null;
  created_at: string | null;
  body_preview: string | null;
  direction: string | null;
}

export default async function CommsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  // event_comms is not yet in generated types — cast to bypass TypeScript depth limit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: msgsData, count: total } = (await (supabase as any)
    .from("event_comms")
    .select("id, subject, channel, recipient_name, recipient_type, status, sent_at, created_at, body_preview, direction", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(40)) as { data: CommsMessage[] | null; count: number | null };

  const msgs = msgsData ?? [];

  const sent = msgs.filter((m) => m.status === "sent").length;
  const pending = msgs.filter((m) => m.status === "pending").length;
  const failed = msgs.filter((m) => m.status === "failed").length;
  const drafts = msgs.filter((m) => m.status === "draft").length;

  const kpis = [
    { label: "Total Messages", value: total ?? 0, sub: "All channels", color: "text-surface-900" },
    { label: "Sent",           value: sent,        sub: `${total ? Math.round((sent / (total ?? 1)) * 100) : 0}% delivered`, color: "text-success-700" },
    { label: "Pending",        value: pending,     sub: "Queued to send", color: "text-warning-700" },
    { label: "Failed",         value: failed,      sub: failed > 0 ? "Action required" : "None", color: failed > 0 ? "text-danger-700" : "text-surface-500" },
    { label: "Drafts",         value: drafts,      sub: "Not yet sent", color: "text-surface-600" },
  ];

  // Group by day
  const byDay = new Map<string, CommsMessage[]>();
  for (const m of msgs) {
    const d = m.created_at ? new Date(m.created_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Unknown";
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(m);
  }

  return (
    <div className="space-y-6 p-6 pb-12 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-surface-900">Communications</h2>
          <p className="text-sm text-surface-500">All outbound and inbound messages for this event.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3.5 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 shadow-sm">
            <Mail className="h-4 w-4" />
            Draft Email
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm">
            <Send className="h-4 w-4" />
            New Message
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-5 gap-3">
        {kpis.map(({ label, value, sub, color }) => (
          <div key={label} className="rounded-xl border border-surface-200 bg-white p-4 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">{label}</p>
            <p className={`mt-1 text-2xl font-bold tracking-tight ${color}`}>{value}</p>
            <p className="mt-0.5 text-[11px] text-surface-400">{sub}</p>
          </div>
        ))}
      </div>

      {msgs.length === 0 ? (
        <div className="rounded-xl border border-surface-200 bg-white shadow-card py-16 text-center">
          <MessageSquare className="mx-auto h-10 w-10 text-surface-300 mb-3" />
          <p className="text-sm font-medium text-surface-900">No messages yet</p>
          <p className="text-xs text-surface-400 mt-1">Send emails, SMS or in-app messages to guests, suppliers and stakeholders.</p>
          <button className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            <Send className="h-4 w-4" />
            Send First Message
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {[...byDay.entries()].map(([day, dayMsgs]) => (
            <div key={day}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">{day}</span>
                <div className="flex-1 h-px bg-surface-200" />
              </div>
              <div className="space-y-2">
                {dayMsgs.map((msg) => {
                  const ch = CHANNEL_STYLES[(msg.channel ?? "email").toLowerCase()] ?? CHANNEL_STYLES.email;
                  const st = MSG_STATUS[(msg.status ?? "pending").toLowerCase()] ?? MSG_STATUS.pending;
                  const isOutbound = !msg.direction || msg.direction === "outbound";
                  return (
                    <div key={msg.id} className="flex items-start gap-3 rounded-xl border border-surface-200 bg-white px-4 py-3.5 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                      <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg ${ch.bg} ${ch.text}`}>
                        {ch.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-surface-900 truncate">{msg.subject ?? "No subject"}</p>
                            <p className="text-xs text-surface-500">
                              {isOutbound ? "To:" : "From:"} {msg.recipient_name ?? "Unknown"}
                              {msg.recipient_type && <span className="ml-1 text-surface-400">({msg.recipient_type})</span>}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold capitalize ${st}`}>
                              {msg.status ?? "pending"}
                            </span>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${ch.bg} ${ch.text}`}>
                              {ch.icon}
                              <span className="capitalize">{msg.channel ?? "email"}</span>
                            </span>
                          </div>
                        </div>
                        {msg.body_preview && (
                          <p className="mt-1 text-[11px] text-surface-400 line-clamp-1">{msg.body_preview}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
