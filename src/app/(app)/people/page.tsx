"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { api } from "@/lib/api";
import { formatRelativeTime, initials } from "@/lib/ui";
import { TabNav } from "@/components/TabNav";
import { PriorityBadge } from "@/components/PriorityBadge";
import { SearchIcon } from "@/components/Icons";
import type { Priority } from "@/lib/types";

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

      <TabNav
        tabs={[
          { href: "/people", label: "People" },
          { href: "/documents", label: "Documents" },
        ]}
      />

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full rounded-full border border-hairline bg-transparent py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none"
        />
      </div>

      {isLoading && <p className="text-sm text-ink-faint">{activeQuery ? "Searching…" : "Loading…"}</p>}

      {!isLoading && people.length === 0 && (
        <p className="text-sm text-ink-faint">
          {activeQuery ? `No one matched “${trimmed}”.` : "No people synced yet."}
        </p>
      )}

      {!isLoading && people.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {people.map((p) => (
            <li key={p.id}>
              <Link
                href={`/people/${p.id}`}
                className="card-paper flex items-start gap-3 p-4 transition hover:border-surface-ink-faint"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-deep text-xs font-medium text-surface-ink">
                  {initials(p.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-surface-ink">{p.name}</p>
                    <PriorityBadge priority={p.importance as Priority} className="shrink-0" />
                  </div>
                  {(p.org || p.email) && (
                    <p className="mt-0.5 truncate text-xs text-surface-ink-soft">{p.org || p.email}</p>
                  )}
                  {p.lastContactAt && (
                    <p className="mt-1 truncate text-xs text-surface-ink-faint">
                      last spoke {formatRelativeTime(p.lastContactAt)}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
