"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Undo2, Copy, QrCode, CheckCircle2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { checkInGuest, undoCheckIn, generateTokens } from "./actions";

export interface CheckInGuestRow {
  id: string;
  name: string;
  email: string | null;
  table_number: string | null;
  guest_type: string;
  checked_in_at: string | null;
  check_in_token: string | null;
}

interface Props {
  eventId: string;
  guests: CheckInGuestRow[];
}

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function CheckInClient({ eventId, guests }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [origin, setOrigin] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const missingTokens = guests.some((g) => !g.check_in_token);

  function doCheckIn(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        await checkInGuest(eventId, id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not check in guest");
      }
    });
  }

  function doUndo(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        await undoCheckIn(eventId, id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not undo check-in");
      }
    });
  }

  function doGenerate() {
    setError(null);
    startTransition(async () => {
      try {
        await generateTokens(eventId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not generate links");
      }
    });
  }

  async function copyLink(token: string, id: string) {
    const url = `${origin}/check-in/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      setError("Could not copy link to clipboard");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-surface-900">Guest list</h2>
        {missingTokens && (
          <button
            type="button"
            onClick={doGenerate}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-3.5 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 disabled:opacity-50"
          >
            <QrCode className="h-4 w-4" strokeWidth={1.8} />
            Generate check-in links
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 text-left">
              <Th>Guest</Th>
              <Th>Table</Th>
              <Th>Status</Th>
              <Th>Check-in link</Th>
              <Th className="text-right">Action</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {guests.map((g) => {
              const isIn = Boolean(g.checked_in_at);
              return (
                <tr key={g.id} className="hover:bg-surface-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-surface-900">{g.name}</div>
                    {g.email && (
                      <div className="text-xs text-surface-400">{g.email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-surface-600">{g.table_number ?? "—"}</td>
                  <td className="px-4 py-3">
                    {isIn ? (
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success-700">
                        <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} />
                        {g.checked_in_at &&
                          `Arrived ${TIME_FMT.format(new Date(g.checked_in_at))}`}
                      </span>
                    ) : (
                      <StatusBadge status="pending" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {g.check_in_token ? (
                      <button
                        type="button"
                        onClick={() => copyLink(g.check_in_token!, g.id)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-surface-200 bg-surface-50 px-2 py-1 font-mono text-xs text-surface-600 hover:border-brand-300 hover:text-brand-700"
                        title={`${origin}/check-in/${g.check_in_token}`}
                      >
                        {copiedId === g.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-success-600" strokeWidth={2} />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" strokeWidth={1.8} />
                            /check-in/{g.check_in_token.slice(0, 8)}…
                          </>
                        )}
                      </button>
                    ) : (
                      <span className="text-xs text-surface-300">No link yet</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      {isIn ? (
                        <button
                          type="button"
                          onClick={() => doUndo(g.id)}
                          disabled={pending}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:bg-surface-50 disabled:opacity-50"
                        >
                          <Undo2 className="h-4 w-4" strokeWidth={1.8} />
                          Undo
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => doCheckIn(g.id)}
                          disabled={pending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                        >
                          <Check className="h-4 w-4" strokeWidth={1.8} />
                          Check in
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-surface-500 ${className}`}
    >
      {children}
    </th>
  );
}
