"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { getProfile, updateProfile } from "@/lib/profile-api";
import { initials } from "@/lib/ui";

function supportedTimezones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (fn) return fn("timeZone");
  } catch {
    /* ignore */
  }
  return ["UTC"];
}

export default function SettingsPage() {
  const { data: profile, isLoading, mutate } = useSWR("profile", getProfile);
  const timezones = useMemo(supportedTimezones, []);
  const [savingTz, setSavingTz] = useState(false);
  const [savingHour, setSavingHour] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: { timezone?: string; digestHour?: number | null }, which: "tz" | "hour") {
    (which === "tz" ? setSavingTz : setSavingHour)(true);
    setError(null);
    setConfirm(null);
    try {
      const next = await updateProfile(patch);
      await mutate(next, { revalidate: false });
      setConfirm("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      (which === "tz" ? setSavingTz : setSavingHour)(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-soft">Your account.</p>
      </div>

      {isLoading && <p className="text-sm text-ink-soft">Loading account…</p>}

      {profile && (
        <div className="rounded-lg border border-hairline bg-paper-raised p-5">
          <div className="flex items-center gap-4">
            {profile.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.image} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-medium text-brand-ink">
                {initials(profile.name)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{profile.name ?? "Unnamed"}</p>
              <p className="text-sm text-ink-soft">{profile.email ?? "No email on file"}</p>
            </div>
          </div>

          <div className="mt-5 space-y-4 border-t border-hairline pt-4">
            <div>
              <label htmlFor="tz" className="block text-xs font-medium uppercase tracking-wide text-ink-faint">
                Timezone
              </label>
              <select
                id="tz"
                value={profile.timezone}
                disabled={savingTz}
                onChange={(e) => save({ timezone: e.target.value }, "tz")}
                className="mt-1.5 w-full max-w-xs rounded-md border border-hairline bg-paper-raised px-3 py-2 text-sm text-ink focus:border-hairline-strong focus:outline-none disabled:opacity-50"
              >
                {!timezones.includes(profile.timezone) && (
                  <option value={profile.timezone}>{profile.timezone}</option>
                )}
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="digestHour" className="block text-xs font-medium uppercase tracking-wide text-ink-faint">
                Digest hour
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  id="digestHour"
                  type="number"
                  min={0}
                  max={23}
                  disabled={savingHour}
                  defaultValue={profile.digestHour ?? ""}
                  placeholder="Use default"
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    const nextVal = raw === "" ? null : Number(raw);
                    if (nextVal !== null && (!Number.isInteger(nextVal) || nextVal < 0 || nextVal > 23)) {
                      setError("Digest hour must be between 0 and 23.");
                      return;
                    }
                    if (nextVal === (profile.digestHour ?? null)) return;
                    save({ digestHour: nextVal }, "hour");
                  }}
                  className="w-28 rounded-md border border-hairline bg-paper-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none disabled:opacity-50"
                />
                <span className="text-xs text-ink-faint">0–23, or blank to use the default.</span>
              </div>
            </div>

            {confirm && <p className="text-xs text-success">{confirm}</p>}
            {error && <p className="text-xs text-critical">{error}</p>}
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-hairline pt-4">
            <Link
              href="/whatsapp"
              className="text-sm text-ink-soft underline decoration-dotted hover:text-ink"
            >
              WhatsApp digest → Manage
            </Link>
            <Link
              href="/api/auth/signout"
              className="text-sm text-ink-soft underline decoration-dotted hover:text-ink"
            >
              Sign out
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
