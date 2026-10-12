"use client";
import { ChevronDown, Link2, Lock, LockOpen, XCircle } from "lucide-react";
import { Menu, useAction } from "@/components/kit/client";
import { confirmDialog, copyText } from "@/lib/ui/dialogs";
import { setRequestStatus } from "@/lib/actions/request-status";

/** "More" actions for a marketplace request: copy link, close to new quotes / reopen, cancel. */
export function RequestMore({ id, status }: { id: string; status: string }) {
  const { run } = useAction();
  return <Menu label="More request actions" width={240} trigger={({ open, toggle, id: mid }) => <button type="button" className="k-btn ghost lg" onClick={toggle} aria-expanded={open} aria-controls={mid} aria-haspopup="menu">More<ChevronDown size={15} /></button>}>
    {close => <>
      <button type="button" role="menuitem" className="k-menu-item" onClick={async () => { close(); await copyText(`${location.origin}/organizer/marketplace/requests/${id}`); }}><Link2 size={16} />Copy link to request</button>
      {status === "sent" && <button type="button" role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => setRequestStatus(id, "closed")); }}><Lock size={16} /><span>Close to new quotes<small>Quotes already received stay available</small></span></button>}
      {status === "closed" && <button type="button" role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => setRequestStatus(id, "sent")); }}><LockOpen size={16} />Reopen for quotes</button>}
      {status !== "cancelled" && <><div className="k-menu-sep" /><button type="button" role="menuitem" className="k-menu-item k-red" onClick={async () => { close(); if (await confirmDialog({ title: "Cancel this request?", message: "Providers can no longer quote. Quotes you’ve already accepted are not affected.", confirmLabel: "Cancel request", danger: true })) void run(() => setRequestStatus(id, "cancelled")); }}><XCircle size={16} />Cancel request</button></>}
    </>}
  </Menu>;
}
