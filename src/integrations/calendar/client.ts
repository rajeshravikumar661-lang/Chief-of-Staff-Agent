import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import {
  getGoogleClient,
  markConnectionError,
} from "@/integrations/google/auth";

/**
 * Thin, normalized wrappers over the Google Calendar v3 API (spec §7).
 * The agent never touches googleapis directly — only these wrappers and the
 * tools in `./tools.ts` do.
 */

export interface NormalizedEvent {
  id: string;
  title: string;
  /** ISO-8601 timestamp (or bare date for all-day events). */
  start: string;
  /** ISO-8601 timestamp (or bare date for all-day events). */
  end: string;
  attendees: string[];
  location: string | null;
  conferenceUrl: string | null;
  htmlLink: string | null;
  /** Raw Google status: "confirmed" | "tentative" | "cancelled". */
  status: string | null;
}

export interface ListEventsOptions {
  timeMin: string;
  timeMax: string;
  q?: string;
  max?: number;
}

export interface CreateEventInput {
  title: string;
  start: string;
  end: string;
  attendees?: string[];
  description?: string;
  location?: string;
}

export interface EventPatch {
  title?: string;
  start?: string;
  end?: string;
  attendees?: string[];
  description?: string;
  location?: string;
}

const CALENDAR_ID = "primary";

async function calendarApi(userId: string): Promise<calendar_v3.Calendar> {
  const auth: OAuth2Client = await getGoogleClient(userId, "calendar");
  return google.calendar({ version: "v3", auth });
}

function isAuthError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as {
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  };
  const codes = [e.code, e.status, e.response?.status];
  return codes.some((c) => c === 401 || c === 403);
}

async function withAuthGuard<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isAuthError(err)) {
      await markConnectionError(userId, "calendar");
    }
    throw err;
  }
}

function instantOf(d?: calendar_v3.Schema$EventDateTime | null): string {
  if (!d) return "";
  return d.dateTime ?? d.date ?? "";
}

export function normalizeEvent(e: calendar_v3.Schema$Event): NormalizedEvent {
  const conferenceUrl =
    e.hangoutLink ??
    e.conferenceData?.entryPoints?.find(
      (p) => p.entryPointType === "video" && typeof p.uri === "string",
    )?.uri ??
    null;

  return {
    id: e.id ?? "",
    title: e.summary ?? "(no title)",
    start: instantOf(e.start),
    end: instantOf(e.end),
    attendees: (e.attendees ?? [])
      .map((a) => a.email ?? "")
      .filter((email) => email.length > 0),
    location: e.location ?? null,
    conferenceUrl,
    htmlLink: e.htmlLink ?? null,
    status: e.status ?? null,
  };
}

export async function listEvents(
  userId: string,
  opts: ListEventsOptions,
): Promise<NormalizedEvent[]> {
  const api = await calendarApi(userId);
  const res = await withAuthGuard(userId, () =>
    api.events.list({
      calendarId: CALENDAR_ID,
      timeMin: opts.timeMin,
      timeMax: opts.timeMax,
      q: opts.q,
      maxResults: Math.min(Math.max(opts.max ?? 50, 1), 2500),
      singleEvents: true,
      orderBy: "startTime",
    }),
  );
  return (res.data.items ?? []).map(normalizeEvent);
}

export async function getEvent(
  userId: string,
  id: string,
): Promise<NormalizedEvent> {
  const api = await calendarApi(userId);
  const res = await withAuthGuard(userId, () =>
    api.events.get({ calendarId: CALENDAR_ID, eventId: id }),
  );
  return normalizeEvent(res.data);
}

export async function createEvent(
  userId: string,
  input: CreateEventInput,
): Promise<NormalizedEvent> {
  const api = await calendarApi(userId);
  const requestBody: calendar_v3.Schema$Event = {
    summary: input.title,
    description: input.description,
    location: input.location,
    start: { dateTime: input.start },
    end: { dateTime: input.end },
    attendees: input.attendees?.map((email) => ({ email })),
  };
  const res = await withAuthGuard(userId, () =>
    api.events.insert({
      calendarId: CALENDAR_ID,
      sendUpdates: "all",
      requestBody,
    }),
  );
  return normalizeEvent(res.data);
}

export async function updateEvent(
  userId: string,
  id: string,
  patch: EventPatch,
): Promise<NormalizedEvent> {
  const api = await calendarApi(userId);
  const requestBody: calendar_v3.Schema$Event = {};
  if (patch.title !== undefined) requestBody.summary = patch.title;
  if (patch.description !== undefined) requestBody.description = patch.description;
  if (patch.location !== undefined) requestBody.location = patch.location;
  if (patch.start !== undefined) requestBody.start = { dateTime: patch.start };
  if (patch.end !== undefined) requestBody.end = { dateTime: patch.end };
  if (patch.attendees !== undefined) {
    requestBody.attendees = patch.attendees.map((email) => ({ email }));
  }
  const res = await withAuthGuard(userId, () =>
    api.events.patch({
      calendarId: CALENDAR_ID,
      eventId: id,
      sendUpdates: "all",
      requestBody,
    }),
  );
  return normalizeEvent(res.data);
}

export async function cancelEvent(userId: string, id: string): Promise<void> {
  const api = await calendarApi(userId);
  await withAuthGuard(userId, () =>
    api.events.delete({
      calendarId: CALENDAR_ID,
      eventId: id,
      sendUpdates: "all",
    }),
  );
}

export async function addAttendee(
  userId: string,
  id: string,
  email: string,
): Promise<NormalizedEvent> {
  const api = await calendarApi(userId);
  const current = await withAuthGuard(userId, () =>
    api.events.get({ calendarId: CALENDAR_ID, eventId: id }),
  );
  const attendees: calendar_v3.Schema$EventAttendee[] = [
    ...(current.data.attendees ?? []),
  ];
  const already = attendees.some(
    (a) => (a.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  if (!already) attendees.push({ email });

  const res = await withAuthGuard(userId, () =>
    api.events.patch({
      calendarId: CALENDAR_ID,
      eventId: id,
      sendUpdates: "all",
      requestBody: { attendees },
    }),
  );
  return normalizeEvent(res.data);
}
