"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "ai" | "user";
  text: string;
}

// ── Seed conversation ──────────────────────────────────────────────────────────

const INITIAL_MESSAGES: Message[] = [
  {
    id: "m0",
    role: "ai",
    text: "Hi! I'm your Gala Copilot. Ask me anything about your events, tasks, suppliers or finances — I'm here to help.",
  },
];

const CANNED_RESPONSE =
  "I'm analysing your workspace data... This feature connects to your live data in the next release. For now, I can help with general event planning queries.";

const QUICK_ACTIONS = ["Overdue tasks", "Events this week", "Unpaid invoices"];

// ── Component ──────────────────────────────────────────────────────────────────

export function GalaCopilot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const unreadCount = messages.filter((m) => m.role === "ai").length - 1; // all AI messages beyond the first

  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;

    const userMsg: Message = {
      id: `m${Date.now()}`,
      role: "user",
      text: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setThinking(true);

    setTimeout(() => {
      const aiMsg: Message = {
        id: `m${Date.now() + 1}`,
        role: "ai",
        text: CANNED_RESPONSE,
      };
      setMessages((prev) => [...prev, aiMsg]);
      setThinking(false);
    }, 1200);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <>
      {/* ── Slide-up chat panel ─────────────────────────────────────────────── */}
      {open && (
        <div className="fixed bottom-24 right-6 w-[360px] max-h-[520px] bg-white rounded-2xl shadow-2xl border border-surface-200 flex flex-col overflow-hidden z-50 animate-fade-in">
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ background: "#0e0c27" }}
          >
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

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {messages.map((msg, index) => (
              <div key={msg.id}>
                <div
                  className={cn(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "px-4 py-3 text-sm max-w-[85%] leading-relaxed",
                      msg.role === "ai"
                        ? "bg-surface-50 text-surface-800 rounded-2xl rounded-tl-sm border border-surface-200"
                        : "bg-brand-600 text-white rounded-2xl rounded-tr-sm"
                    )}
                  >
                    {msg.text}
                  </div>
                </div>

                {/* Quick action chips — only after the first AI message */}
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

            {/* Thinking indicator */}
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

          {/* Input bar */}
          <div className="shrink-0 border-t border-surface-200 px-3 py-3 bg-white">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Gala Copilot…"
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
              AI responses may not always be accurate. Always verify critical information.
            </p>
          </div>
        </div>
      )}

      {/* ── Floating bubble ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-700 shadow-xl fixed bottom-6 right-6 z-50 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
        aria-label="Open Gala Copilot"
      >
        <Sparkles className="w-6 h-6 text-white" strokeWidth={1.8} />

        {/* Unread badge */}
        {!open && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-danger-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    </>
  );
}
