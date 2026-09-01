import { z } from "zod";
import {
  defineTool,
  type Tool,
  type ToolResult,
  type VerificationResult,
} from "@/agent/tools/types";
import { ConnectionMissingError } from "@/integrations/google/auth";
import {
  addAttendee,
  cancelEvent,
  createEvent,
  getEvent,
  listEvents,
  type NormalizedEvent,
} from "./client";

const DAY_MS = 24 * 60 * 60 * 1000;

function toErrorResult(err: unknown, summary: string): ToolResult {
  if (err instanceof ConnectionMissingError) {
    return { ok: false, summary: "Google Calendar is not connected.", error: err.message };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, summary, error: message };
}

function sameInstant(a: string, b: string): boolean {
  if (a === b) return true;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return ta === tb;
}

/* --------------------------------- search --------------------------------- */

const searchSchema = z.object({
  query: z.string().min(1).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  max: z.number().int().positive().max(250).optional(),
});
type SearchInput = z.infer<typeof searchSchema>;

const searchTool = defineTool<SearchInput>({
  name: "calendar.search",
  description:
    "Search the user's primary Google Calendar for events in a time window. " +
    "Defaults to the window from now to +14 days when no dates are given.",
  inputSchema: searchSchema,
  permission: "READ",
  async execute(input, ctx) {
    try {
      const now = Date.now();
      const timeMin = input.from ?? new Date(now).toISOString();
      const timeMax = input.to ?? new Date(now + 14 * DAY_MS).toISOString();
      const events = await listEvents(ctx.userId, {
        timeMin,
        timeMax,
        q: input.query,
        max: input.max,
      });
      return {
        ok: true,
        data: events,
        summary: `Found ${events.length} calendar event(s) between ${timeMin} and ${timeMax}.`,
      };
    } catch (err) {
      return toErrorResult(err, "Calendar search failed.");
    }
  },
});

/* -------------------------------- get_event ------------------------------- */

const getEventSchema = z.object({ eventId: z.string().min(1) });
type GetEventInput = z.infer<typeof getEventSchema>;

const getEventTool = defineTool<GetEventInput>({
  name: "calendar.get_event",
  description: "Fetch a single Google Calendar event by its id.",
  inputSchema: getEventSchema,
  permission: "READ",
  async execute(input, ctx) {
    try {
      const event = await getEvent(ctx.userId, input.eventId);
      return {
        ok: true,
        data: event,
        summary: `Event "${event.title}" (${event.start}).`,
      };
    } catch (err) {
      return toErrorResult(err, `Could not fetch event ${input.eventId}.`);
    }
  },
});

/* ------------------------------ create_event ----------------------------- */

const createEventSchema = z.object({
  title: z.string().min(1),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  attendees: z.array(z.string().email()).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
});
type CreateEventInputT = z.infer<typeof createEventSchema>;

const createEventTool = defineTool<CreateEventInputT>({
  name: "calendar.create_event",
  description:
    "Create a new event on the user's primary Google Calendar and notify attendees.",
  inputSchema: createEventSchema,
  permission: "WRITE",
  async execute(input, ctx) {
    try {
      const event = await createEvent(ctx.userId, {
        title: input.title,
        start: input.start,
        end: input.end,
        attendees: input.attendees,
        description: input.description,
        location: input.location,
      });
      return {
        ok: true,
        data: event,
        summary: `Created "${event.title}" starting ${event.start} (id ${event.id}).`,
      };
    } catch (err) {
      return toErrorResult(err, "Failed to create calendar event.");
    }
  },
  async verify(input, result, ctx): Promise<VerificationResult> {
    const created = result.data as NormalizedEvent | undefined;
    if (!created?.id) {
      return { verified: false, detail: "No event id returned from create." };
    }
    try {
      const fetched = await getEvent(ctx.userId, created.id);
      const titleOk = fetched.title === input.title;
      const startOk = sameInstant(fetched.start, input.start);
      return {
        verified: titleOk && startOk,
        detail:
          titleOk && startOk
            ? `Re-fetched event ${created.id}: title and start match.`
            : `Mismatch on re-fetch — title "${fetched.title}" vs "${input.title}", start "${fetched.start}" vs "${input.start}".`,
      };
    } catch (err) {
      return {
        verified: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

/* ------------------------------ cancel_event ---------------------------- */

const cancelEventSchema = z.object({ eventId: z.string().min(1) });
type CancelEventInput = z.infer<typeof cancelEventSchema>;

const cancelEventTool = defineTool<CancelEventInput>({
  name: "calendar.cancel_event",
  description:
    "Cancel (delete) an event on the user's primary Google Calendar and notify attendees.",
  inputSchema: cancelEventSchema,
  permission: "DESTRUCTIVE",
  async execute(input, ctx) {
    try {
      await cancelEvent(ctx.userId, input.eventId);
      return {
        ok: true,
        data: { eventId: input.eventId },
        summary: `Cancelled event ${input.eventId}.`,
      };
    } catch (err) {
      return toErrorResult(err, `Failed to cancel event ${input.eventId}.`);
    }
  },
  async verify(input, _result, ctx): Promise<VerificationResult> {
    try {
      const event = await getEvent(ctx.userId, input.eventId);
      if (event.status === "cancelled") {
        return { verified: true, detail: "Event status is now 'cancelled'." };
      }
      return {
        verified: false,
        detail: `Event still present with status '${event.status ?? "unknown"}'.`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/\b404\b|not found/i.test(message)) {
        return { verified: true, detail: "Event no longer exists (404)." };
      }
      return { verified: false, detail: message };
    }
  },
});

/* ------------------------------ add_attendee --------------------------- */

const addAttendeeSchema = z.object({
  eventId: z.string().min(1),
  email: z.string().email(),
});
type AddAttendeeInput = z.infer<typeof addAttendeeSchema>;

const addAttendeeTool = defineTool<AddAttendeeInput>({
  name: "calendar.add_attendee",
  description:
    "Add an attendee to an existing Google Calendar event and send them an invite.",
  inputSchema: addAttendeeSchema,
  permission: "WRITE",
  async execute(input, ctx) {
    try {
      const event = await addAttendee(ctx.userId, input.eventId, input.email);
      return {
        ok: true,
        data: event,
        summary: `Added ${input.email} to "${event.title}".`,
      };
    } catch (err) {
      return toErrorResult(
        err,
        `Failed to add ${input.email} to event ${input.eventId}.`,
      );
    }
  },
  async verify(input, _result, ctx): Promise<VerificationResult> {
    try {
      const event = await getEvent(ctx.userId, input.eventId);
      const present = event.attendees.some(
        (e) => e.toLowerCase() === input.email.toLowerCase(),
      );
      return {
        verified: present,
        detail: present
          ? `${input.email} is on the event's attendee list.`
          : `${input.email} not found on the event after update.`,
      };
    } catch (err) {
      return {
        verified: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

export const calendarTools: Tool[] = [
  searchTool,
  getEventTool,
  createEventTool,
  cancelEventTool,
  addAttendeeTool,
];
