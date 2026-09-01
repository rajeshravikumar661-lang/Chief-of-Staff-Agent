"use client";

import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";

/**
 * There's no "list all documents" endpoint yet — only cross-source search
 * (GET /api/search?q=). This page is search-driven rather than a browser.
 */
export default function DocumentsPage() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  const { data, isLoading } = useSWR(query.length >= 2 ? ["search-documents", query] : null, () =>
    api.search(query),
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed.length >= 2) setQuery(trimmed);
  }

  const documents = data?.documents ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-ink">Documents</h1>
        <p className="mt-1 text-sm text-ink-soft">Search across your connected documents.</p>
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
          disabled={input.trim().length < 2}
          className="shrink-0 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {!query && (
        <div className="rounded-lg border border-dashed border-hairline p-8 text-center">
          <p className="text-sm text-ink-soft">Search your connected documents</p>
          <p className="mt-1 text-xs text-ink-faint">Try a title, keyword, or topic.</p>
        </div>
      )}

      {query && isLoading && <p className="text-sm text-ink-soft">Searching…</p>}

      {query && !isLoading && documents.length === 0 && (
        <div className="rounded-lg border border-dashed border-hairline p-8 text-center">
          <p className="text-sm text-ink-soft">No documents found for “{query}”.</p>
          <p className="mt-1 text-xs text-ink-faint">
            If this looks empty even for common terms, make sure Drive is connected on the Connections page.
          </p>
        </div>
      )}

      {query && !isLoading && documents.length > 0 && (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-paper-raised">
          {documents.map((doc) => (
            <li key={doc.id} className="px-4 py-3">
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
              {doc.snippet && <p className="mt-1 text-sm text-ink-soft">{doc.snippet}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
