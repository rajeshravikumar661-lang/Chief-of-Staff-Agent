"use client";

import useSWR from "swr";
import { api } from "@/lib/api";
import { initials } from "@/lib/ui";

export default function SettingsPage() {
  const { data: me, isLoading } = useSWR("me", api.me);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-soft">Your account.</p>
      </div>

      {isLoading && <p className="text-sm text-ink-soft">Loading account…</p>}

      {me && (
        <div className="rounded-lg border border-hairline bg-paper-raised p-5">
          <div className="flex items-center gap-4">
            {me.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.image} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-medium text-brand-ink">
                {initials(me.name)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{me.name ?? "Unnamed"}</p>
              <p className="text-sm text-ink-soft">{me.email ?? "No email on file"}</p>
            </div>
          </div>

          <div className="mt-5 border-t border-hairline pt-4">
            <a
              href="/api/auth/signout"
              className="text-sm text-ink-soft underline decoration-dotted hover:text-ink"
            >
              Sign out
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
