"use client";

import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/ui";

/**
 * Documents opens on a default list of the most recently updated synced
 * documents (via GET /api/documents). Typing a query narrows the same list.
 */
export default function DocumentsPage() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  const activeQuery = query.length >= 2 ? query : undefined;

  const { data, isLoading } = useSWR(["documents", activeQuery ?? ""], () =>
    api.documents({ q: activeQuery, limit: 50 }),
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setQuery(input.trim());
  }

  const documents = data?.documents ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-ink">Documents</h1>
        <p className="mt-1 text-sm text-ink-soft">Your most recently updated documents. Search to narrow the list.</p>
      </div>

      <form onSubmit={submit} className="mb-6 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search documents… (min 2 characters)"
          className="min-w-0 flex-1 rounded-md border border-hairline bg-paper-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {isLoading && <p className="text-sm text-ink-soft">{activeQuery ? "Searching…" : "Loading…"}</p>}

      {!isLoading && documents.length === 0 && (
        <div className="rounded-lg border border-dashed border-hairline p-8 text-center">
          <p className="text-sm text-ink-soft">
            {activeQuery ? `No documents found for “${activeQuery}”.` : "No documents synced yet."}
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            If this looks empty even for common terms, make sure Drive is connected on the Connections page.
          </p>
        </div>
      )}

      {!isLoading && documents.length > 0 && (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-paper-raised">
          {documents.map((doc) => (
            <li key={doc.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                {doc.url ? (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-ink underline decoration-dotted hover:text-brand"
                  >
                    {doc.title ?? "Untitled document"}
                  </a>
                ) : (
                  <p className="text-sm font-medium text-ink">{doc.title ?? "Untitled document"}</p>
                )}
                <span className="shrink-0 text-xs text-ink-faint">{formatRelativeTime(doc.updatedAt)}</span>
              </div>
              {doc.snippet && <p className="mt-1 text-sm text-ink-soft">{doc.snippet}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
