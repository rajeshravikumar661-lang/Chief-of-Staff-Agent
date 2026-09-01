"use client";

import { use } from "react";
import Link from "next/link";
import useSWR from "swr";
import { api } from "@/lib/api";
import { PriorityBadge } from "@/components/PriorityBadge";
import { formatRelativeTime, formatClock, initials } from "@/lib/ui";

export default function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: person, isLoading } = useSWR(["person", id], () => api.person(id));

  if (isLoading) {
    return <p className="text-sm text-ink-faint">Loading…</p>;
  }

  if (!person) {
    return <p className="text-sm text-ink-faint">Person not found.</p>;
  }

  return (
    <div className="space-y-8 pb-16">
      <div className="flex items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-soft text-lg font-medium text-brand-ink">
          {initials(person.name)}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-2xl font-semibold text-ink">{person.name}</h1>
            <PriorityBadge priority={person.importance} />
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {[person.org, person.email].filter(Boolean).join(" · ") || "No details on file"}
          </p>
          <p className="mt-0.5 text-xs text-ink-faint">
            {person.lastContactAt ? `Last contact ${formatRelativeTime(person.lastContactAt)}` : "No recent contact"}
          </p>
        </div>
      </div>

      {/* Open commitments */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-faint">Open commitments</h2>
        {person.openCommitments.length === 0 ? (
          <p className="text-sm text-ink-faint">No open commitments with {person.name}.</p>
        ) : (
          <ul className="space-y-2">
            {person.openCommitments.map((c) => (
              <li key={c.id} className="rounded-lg border border-hairline bg-paper-raised p-3">
                <p className="text-sm text-ink">{c.description}</p>
                <p className="mt-1 text-xs text-ink-faint">
                  {c.deadline ? formatRelativeTime(c.deadline) : "no deadline"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Upcoming meetings */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-faint">Upcoming meetings</h2>
        {person.upcomingMeetings.length === 0 ? (
          <p className="text-sm text-ink-faint">Nothing scheduled with {person.name}.</p>
        ) : (
          <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-paper-raised">
            {person.upcomingMeetings.map((m, i) => (
              <li key={m.eventId ?? `${m.time}-${i}`} className="flex items-baseline gap-4 px-4 py-3">
                <span className="w-14 shrink-0 text-sm tabular-nums text-ink-soft">{m.time}</span>
                <span className="text-sm text-ink">{m.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent messages */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-faint">Recent messages</h2>
        {person.recentMessages.length === 0 ? (
          <p className="text-sm text-ink-faint">No recent messages.</p>
        ) : (
          <ul className="space-y-2">
            {person.recentMessages.map((m) => (
              <li key={m.id} className="rounded-lg border border-hairline bg-paper-raised p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium text-ink">{m.subject ?? "(no subject)"}</p>
                  <span className="shrink-0 text-xs text-ink-faint">{formatClock(m.timestamp)}</span>
                </div>
                {m.snippet && <p className="mt-0.5 truncate text-sm text-ink-soft">{m.snippet}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Documents */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-faint">Documents</h2>
        {person.documents.length === 0 ? (
          <p className="text-sm text-ink-faint">No shared documents.</p>
        ) : (
          <ul className="space-y-2">
            {person.documents.map((d) => (
              <li key={d.id} className="rounded-lg border border-hairline bg-paper-raised p-3">
                {d.url ? (
                  <Link href={d.url} className="text-sm text-brand underline decoration-dotted">
                    {d.title ?? d.url}
                  </Link>
                ) : (
                  <span className="text-sm text-ink">{d.title ?? "Untitled document"}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
