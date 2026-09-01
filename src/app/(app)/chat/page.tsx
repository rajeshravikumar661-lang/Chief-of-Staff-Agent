"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { AgentRunCard } from "@/components/AgentRunCard";

interface Turn {
  role: "user" | "assistant";
  content?: string;
  runId?: string;
}

const CONVERSATION_KEY = "cos-chat-conversation-id";

/**
 * Chat is a control surface, not the product (spec §5) — narrow column,
 * quiet input bar, no chat-bubble chrome. A run-producing message just
 * renders the same AgentRunCard used everywhere else, collapsed.
 */
export default function ChatPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    conversationIdRef.current = localStorage.getItem(CONVERSATION_KEY) ?? undefined;
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, sending]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || sending) return;

    setTurns((prev) => [...prev, { role: "user", content: message }]);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const res = await api.chat(message, conversationIdRef.current);
      conversationIdRef.current = res.conversationId;
      localStorage.setItem(CONVERSATION_KEY, res.conversationId);
      setTurns((prev) => [...prev, { role: "assistant", content: res.reply, runId: res.runId }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-2xl flex-col">
      <div className="mb-4">
        <h1 className="font-serif text-xl font-semibold text-ink">Chat</h1>
        <p className="mt-1 text-sm text-ink-soft">Ask for anything — it'll show its work as it goes.</p>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto pb-4">
        {turns.length === 0 && (
          <p className="pt-8 text-center text-sm text-ink-faint">
            Try “What needs my attention today?” or “Handle the follow-up with Priya.”
          </p>
        )}

        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <p key={i} className="text-right text-sm text-ink">
              {turn.content}
            </p>
          ) : (
            <div key={i}>
              {turn.runId ? (
                <AgentRunCard runId={turn.runId} collapsedByDefault />
              ) : (
                <p className="text-sm leading-relaxed text-ink-soft">{turn.content}</p>
              )}
            </div>
          ),
        )}

        {sending && <p className="text-sm text-ink-faint">Thinking…</p>}
        {error && <p className="text-sm text-critical">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-hairline pt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message your Chief of Staff…"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
