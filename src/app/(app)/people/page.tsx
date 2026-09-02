"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { api } from "@/lib/api";
import { initials } from "@/lib/ui";

/**
 * People opens on a default list of contacts, most recently in touch first
 * (via GET /api/people). Typing a query narrows the same list server-side.
 */
export default function PeoplePage() {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const activeQuery = trimmed.length >= 2 ? trimmed : undefined;

  const { data, isLoading } = useSWR(["people-list", activeQuery ?? ""], () =>
    api.peopleList({ q: activeQuery, limit: 100 }),
  );

  const people = data?.people ?? [];

  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-ink">People</h1>
        <p className="mt-1 text-sm text-ink-soft">Relationship intelligence — everyone you work with.</p>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or email…"
        className="w-full rounded-lg border border-hairline-strong bg-paper-raised px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
      />

      {isLoading && <p className="text-sm text-ink-faint">{activeQuery ? "Searching…" : "Loading…"}</p>}

      {!isLoading && people.length === 0 && (
        <p className="text-sm text-ink-faint">
          {activeQuery ? `No one matched “${trimmed}”.` : "No people synced yet."}
        </p>
      )}

      {!isLoading && people.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {people.map((p) => (
            <li key={p.id}>
              <Link
                href={`/people/${p.id}`}
                className="flex items-center gap-3 rounded-lg border border-hairline bg-paper-raised p-3 transition hover:border-hairline-strong"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-medium text-brand-ink">
                  {initials(p.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{p.name}</p>
                  {p.email && <p className="truncate text-xs text-ink-faint">{p.email}</p>}
                  {p.org && <p className="truncate text-xs text-ink-faint">{p.org}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
