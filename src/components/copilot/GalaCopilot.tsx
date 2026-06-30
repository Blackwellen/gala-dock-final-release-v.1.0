"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { Sparkles, X, Send, Inbox, MessageSquare, Slash } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { askCopilot, planCopilot, type CopilotTurn, type ProposedCommand } from "@/app/event-manager/copilot/actions";
import { runSlashCommand, type RunResult } from "@/app/event-manager/copilot/run";
import { searchCommands } from "@/lib/copilot/commands";
import { parseSlash } from "@/lib/copilot/parse";
import { onOpenCopilot } from "@/lib/shell/copilot-bus";

interface MsgLink {
  label: string;
  href?: string;
  meta?: string;
}

interface Message {
  id: string;
  role: "ai" | "user";
  text: string;
  links?: MsgLink[];
  commands?: ProposedCommand[];
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

type Tab = "copilot" | "inbox";

const INITIAL_MESSAGES: Message[] = [
  {
    id: "m0",
    role: "ai",
    text: "Hi! I'm Gala Copilot. Ask me about your events, suppliers, tasks or finances — or type / for commands.",
  },
];

const QUICK_ACTIONS = ["What's overdue?", "Events this week", "Find a DJ for the 12th"];

export function GalaCopilot() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("copilot");
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const showPalette = input.startsWith("/");
  const paletteMatches = useMemo(() => (showPalette ? searchCommands(input).slice(0, 6) : []), [input, showPalette]);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Open from the top-bar Copilot button (sibling component, event bus).
  useEffect(() => onOpenCopilot(() => setOpen(true)), []);

  useEffect(() => {
    if (open && tab === "copilot") setTimeout(() => inputRef.current?.focus(), 120);
  }, [open, tab]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;

    const userMsg: Message = { id: `u${Date.now()}`, role: "user", text: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setThinking(true);

    // Slash command → planner or execution router
    const parsed = trimmed.startsWith("/") ? parseSlash(trimmed) : null;
    if (parsed) {
      if (parsed.id === "plan") {
        const goal = parsed.args.goal ?? parsed.args._ ?? "";
        const plan = await planCopilot(goal);
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "ai", text: plan.note, commands: plan.ok && plan.commands.length ? plan.commands : undefined },
        ]);
        setThinking(false);
        return;
      }
      const res = await runSlashCommand(parsed.id, parsed.args);
      appendResult(res);
      setThinking(false);
      return;
    }

    // Otherwise → conversational chat
    const turns: CopilotTurn[] = next.map((m) => ({ role: m.role, text: m.text }));
    const result = await askCopilot(turns);
    setMessages((prev) => [...prev, { id: uid(), role: "ai", text: result.text }]);
    setThinking(false);
  }

  function appendResult(res: RunResult) {
    if (res.kind === "navigate") {
      setMessages((prev) => [...prev, { id: uid(), role: "ai", text: res.text }]);
      router.push(res.href);
    } else if (res.kind === "list") {
      setMessages((prev) => [...prev, { id: uid(), role: "ai", text: `${res.title}:`, links: res.items }]);
    } else {
      setMessages((prev) => [...prev, { id: uid(), role: "ai", text: res.text }]);
    }
  }

  async function runProposedCommand(cmd: ProposedCommand) {
    if (thinking) return;
    setThinking(true);
    const res = await runSlashCommand(cmd.id, cmd.args);
    appendResult(res);
    setThinking(false);
  }

  // Phase 5: sequential plan runner (queue execution) with step status.
  async function runProposedChain(cmds: ProposedCommand[]) {
    if (thinking || cmds.length === 0) return;
    setThinking(true);
    for (let i = 0; i < cmds.length; i++) {
      setMessages((prev) => [...prev, { id: uid(), role: "ai", text: `Step ${i + 1}/${cmds.length} — ${cmds[i].label}` }]);
      const res = await runSlashCommand(cmds[i].id, cmds[i].args);
      appendResult(res);
    }
    setThinking(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const unreadCount = messages.filter((m) => m.role === "ai").length - 1;

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 w-[380px] max-h-[560px] bg-white rounded-2xl shadow-2xl border border-surface-200 flex flex-col overflow-hidden z-50 animate-fade-in">
          {/* Header + tabs */}
          <div className="shrink-0" style={{ background: "#0e0c27" }}>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-400" strokeWidth={1.8} />
                <span className="text-sm font-semibold text-white">Gala Copilot</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-500/30 text-brand-300 border border-brand-500/30">
                  Beta
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close Copilot"
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
            <div className="flex items-center gap-1 px-3 pb-2">
              {([
                { id: "copilot" as Tab, label: "Copilot", icon: MessageSquare },
                { id: "inbox" as Tab, label: "Inbox", icon: Inbox },
              ]).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                    tab === id ? "bg-white/15 text-white" : "text-white/55 hover:text-white hover:bg-white/10"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {tab === "copilot" ? (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {messages.map((msg, index) => (
                  <div key={msg.id}>
                    <div className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "px-4 py-3 text-sm max-w-[85%] leading-relaxed whitespace-pre-wrap",
                          msg.role === "ai"
                            ? "bg-surface-50 text-surface-800 rounded-2xl rounded-tl-sm border border-surface-200"
                            : "bg-brand-600 text-white rounded-2xl rounded-tr-sm"
                        )}
                      >
                        {msg.text}
                      </div>
                    </div>
                    {msg.role === "ai" && msg.commands && msg.commands.length > 0 && (
                      <div className="flex flex-col gap-1 mt-2">
                        {msg.commands.length > 1 && (
                          <button
                            onClick={() => runProposedChain(msg.commands!)}
                            disabled={thinking}
                            className="mb-0.5 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            Run all {msg.commands.length} steps
                          </button>
                        )}
                        {msg.commands.map((c, i) => (
                          <button
                            key={i}
                            onClick={() => runProposedCommand(c)}
                            disabled={thinking}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-brand-200 bg-brand-50 hover:bg-brand-100 text-sm text-brand-700 disabled:opacity-50 text-left"
                          >
                            <Slash className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{c.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {msg.role === "ai" && msg.links && msg.links.length > 0 && (
                      <div className="flex flex-col gap-1 mt-2">
                        {msg.links.map((l, i) =>
                          l.href ? (
                            <Link
                              key={i}
                              href={l.href}
                              onClick={() => setOpen(false)}
                              className="flex items-center justify-between px-3 py-2 rounded-lg border border-surface-200 hover:bg-surface-50 text-sm text-surface-800"
                            >
                              <span className="truncate">{l.label}</span>
                              {l.meta && <span className="text-xs text-surface-400 ml-2 shrink-0">{l.meta}</span>}
                            </Link>
                          ) : (
                            <span key={i} className="px-3 py-2 text-sm text-surface-700">{l.label}</span>
                          )
                        )}
                      </div>
                    )}
                    {msg.role === "ai" && index === 0 && (
                      <div className="flex flex-wrap gap-2 mt-2.5">
                        {QUICK_ACTIONS.map((action) => (
                          <button
                            key={action}
                            onClick={() => sendMessage(action)}
                            disabled={thinking}
                            className="px-3 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 border border-brand-200 rounded-full hover:bg-brand-100 transition-colors disabled:opacity-50"
                          >
                            {action}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {thinking && (
                  <div className="flex justify-start">
                    <div className="bg-surface-50 border border-surface-200 rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-surface-400 animate-bounce [animation-delay:0ms]" />
                        <span className="w-2 h-2 rounded-full bg-surface-400 animate-bounce [animation-delay:150ms]" />
                        <span className="w-2 h-2 rounded-full bg-surface-400 animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Slash palette */}
              {showPalette && paletteMatches.length > 0 && (
                <div className="shrink-0 border-t border-surface-200 max-h-44 overflow-y-auto bg-white">
                  {paletteMatches.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setInput(`/${c.id} `);
                        inputRef.current?.focus();
                      }}
                      className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-surface-50 transition-colors"
                    >
                      <Slash className="w-3.5 h-3.5 mt-0.5 text-brand-500 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-surface-800">
                          /{c.id}
                          <span className="ml-2 text-[10px] font-normal text-surface-400 uppercase tracking-wide">{c.category}</span>
                          {c.requiresApproval && <span className="ml-2 text-[10px] text-warning-600">needs approval</span>}
                        </span>
                        <span className="block text-xs text-surface-500 truncate">{c.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="shrink-0 border-t border-surface-200 px-3 py-3 bg-white">
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Copilot, or type / for commands…"
                    disabled={thinking}
                    className="flex-1 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 bg-surface-50 border border-surface-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors disabled:opacity-60"
                  />
                  <button
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || thinking}
                    className="w-9 h-9 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 flex items-center justify-center text-white transition-colors shrink-0"
                    aria-label="Send message"
                  >
                    <Send className="w-4 h-4" strokeWidth={2} />
                  </button>
                </div>
                <p className="text-[10px] text-surface-400 mt-2 text-center">
                  AI can make mistakes. Actions ask for confirmation before changing anything.
                </p>
              </div>
            </>
          ) : (
            /* Inbox tab */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
              <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center">
                <Inbox className="w-5 h-5 text-brand-600" />
              </div>
              <p className="text-sm text-surface-600">Your client &amp; supplier conversations live in the Inbox.</p>
              <Link
                href="/event-manager/inbox"
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700"
              >
                Open Inbox
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Floating bubble */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-700 shadow-xl fixed bottom-6 right-6 z-50 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
        aria-label="Open Gala Copilot"
      >
        <Sparkles className="w-6 h-6 text-white" strokeWidth={1.8} />
        {!open && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-danger-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    </>
  );
}
