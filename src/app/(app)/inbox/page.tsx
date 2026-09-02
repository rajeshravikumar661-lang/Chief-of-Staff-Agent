"use client";

import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/ui";
import { WhatsAppConnect } from "@/components/WhatsAppConnect";
import type { MessagesResponse } from "@/lib/types";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

type Message = MessagesResponse["messages"][number];

function MessageList({ messages }: { messages: Message[] }) {
  return (
    <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-paper-raised">
      {messages.map((msg) => (
        <li key={msg.id} className="px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {msg.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
              <p className="truncate text-sm font-semibold text-ink">{msg.subject ?? "(no subject)"}</p>
            </div>
            <span className="shrink-0 text-xs text-ink-faint">{formatRelativeTime(msg.timestamp)}</span>
          </div>
          {msg.sender && <p className="mt-1 text-xs text-ink-faint">{msg.sender}</p>}
          {msg.snippet && <p className="mt-1 text-sm text-ink-soft">{msg.snippet}</p>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Inbox opens on a default list of the most recent synced messages (via
 * GET /api/messages). Typing a query narrows the same list server-side.
 * The WhatsApp filter still surfaces the link/manage flow, and shows any
 * synced WhatsApp messages below it.
 */
export default function InboxPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  const activeQuery = query.length >= 2 ? query : undefined;

  const { data, isLoading } = useSWR(["messages", filter, activeQuery ?? ""], () =>
    api.messages({ filter, q: activeQuery, limit: 50 }),
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setQuery(input.trim());
  }

  const messages = data?.messages ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-ink">Inbox</h1>
        <p className="mt-1 text-sm text-ink-soft">Your most recent synced messages. Search to narrow the list.</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full px-3 py-1 text-sm font-medium transition",
              filter === f.value ? "bg-brand-soft text-brand-ink" : "text-ink-soft hover:bg-paper-raised",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filter === "whatsapp" && (
        <div className="mb-6">
          <WhatsAppConnect />
        </div>
      )}

      {filter !== "whatsapp" && (
        <form onSubmit={submit} className="mb-6 flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search your inbox… (min 2 characters)"
            className="min-w-0 flex-1 rounded-md border border-hairline bg-paper-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none"
          />
          <button
            type="submit"
            className="shrink-0 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            Search
          </button>
        </form>
      )}

      {isLoading && <p className="text-sm text-ink-soft">{activeQuery ? "Searching…" : "Loading…"}</p>}

      {!isLoading && messages.length === 0 && (
        <div className="rounded-lg border border-dashed border-hairline p-8 text-center">
          <p className="text-sm text-ink-soft">
            {activeQuery ? `No messages found for “${activeQuery}”.` : "No messages synced yet."}
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            If this looks empty even for common terms, make sure Gmail is connected under Settings → Integrations.
          </p>
        </div>
      )}

      {!isLoading && messages.length > 0 && <MessageList messages={messages} />}
    </div>
  );
}
