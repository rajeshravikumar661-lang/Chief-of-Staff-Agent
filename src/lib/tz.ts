/**
 * Per-user timezone formatting. Times are stored in UTC; every user-facing
 * render must go through here with the user's IANA zone (User.timezone) so a
 * server running in UTC doesn't show everyone UTC clock times.
 *
 * Pure — uses the platform Intl API, no dependencies.
 */

export const DEFAULT_TZ = "UTC";

function isValidTz(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Normalize an incoming timezone string, falling back to UTC. */
export function normalizeTz(tz: string | null | undefined): string {
  return isValidTz(tz) ? tz : DEFAULT_TZ;
}

/** "09:30" in the given zone. */
export function formatTime(d: Date, tz: string | null | undefined): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: normalizeTz(tz),
  }).format(d);
}

/** "Tue 2 Sep" in the given zone. */
export function formatDay(d: Date, tz: string | null | undefined): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: normalizeTz(tz),
  }).format(d);
}

/** "Tue 2 Sep, 09:30" in the given zone. */
export function formatDateTime(d: Date, tz: string | null | undefined): string {
  return `${formatDay(d, tz)}, ${formatTime(d, tz)}`;
}

/** The hour (0–23) at instant `d` as seen in `tz`. */
export function hourInTz(d: Date, tz: string | null | undefined): number {
  const s = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    timeZone: normalizeTz(tz),
  }).format(d);
  return Number.parseInt(s, 10) % 24;
}

/** "Good morning" / "Good afternoon" / "Good evening" for `tz` at instant `d`. */
export function greeting(d: Date, tz: string | null | undefined): string {
  const h = hourInTz(d, tz);
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Start/end of the local day (in `tz`) that contains `d`, as UTC Date objects. */
export function dayBoundsInTz(d: Date, tz: string | null | undefined): { start: Date; end: Date } {
  const zone = normalizeTz(tz);
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: zone,
  }).format(d); // YYYY-MM-DD
  // Offset (minutes) of `zone` from UTC at instant `d`.
  const asUtc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const asZone = new Date(d.toLocaleString("en-US", { timeZone: zone }));
  const offsetMin = Math.round((asZone.getTime() - asUtc.getTime()) / 60000);
  const startLocal = new Date(`${parts}T00:00:00.000Z`);
  const start = new Date(startLocal.getTime() - offsetMin * 60000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}
