"use client";

import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/ui";

/**
 * There's no "list messages" endpoint yet — only cross-source search
 * (GET /api/search?q=). This is search over synced messages, not an
 * unread/all-mail view.
 */
export default function InboxPage() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  const { data, isLoading } = useSWR(query.length >= 2 ? ["search-messages", query] : null, () =>
    api.search(query),
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed.length >= 2) setQuery(trimmed);
  }

  const messages = data?.messages ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-ink">Inbox</h1>
        <p className="mt-1 text-sm text-ink-soft">Search your synced messages — this isn&apos;t a full unread view yet.</p>
      </div>

      <form onSubmit={submit} className="mb-6 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search your inbox… (min 2 characters)"
          className="min-w-0 flex-1 rounded-md border border-hairline bg-paper-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none"
        />
        <button
          type="submit"
          disabled={input.trim().length < 2}
          className="shrink-0 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {!query && (
        <div className="rounded-lg border border-dashed border-hairline p-8 text-center">
          <p className="text-sm text-ink-soft">Search your inbox</p>
          <p className="mt-1 text-xs text-ink-faint">Try a sender, subject, or keyword.</p>
        </div>
      )}

      {query && isLoading && <p className="text-sm text-ink-soft">Searching…</p>}

      {query && !isLoading && messages.length === 0 && (
        <div className="rounded-lg border border-dashed border-hairline p-8 text-center">
          <p className="text-sm text-ink-soft">No messages found for “{query}”.</p>
          <p className="mt-1 text-xs text-ink-faint">
            If this looks empty even for common terms, make sure Gmail is connected on the Connections page.
          </p>
        </div>
      )}

      {query && !isLoading && messages.length > 0 && (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-paper-raised">
          {messages.map((msg) => (
            <li key={msg.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-ink">{msg.subject ?? "(no subject)"}</p>
                <span className="shrink-0 text-xs text-ink-faint">{formatRelativeTime(msg.timestamp)}</span>
              </div>
              {msg.snippet && <p className="mt-1 text-sm text-ink-soft">{msg.snippet}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
