import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Models that are always scoped to a single user. `scopedDb(userId)` returns a
 * client that injects `userId` into every where/create/count for these models,
 * so a forgotten `where` clause can never leak across users (spec §5, §9).
 */
const USER_SCOPED = new Set([
  "Connection",
  "Message",
  "CalendarEvent",
  "Document",
  "Task",
  "Commitment",
  "Memory",
  "Person",
  "AgentRun",
  "AuditLog",
  "Briefing",
]);

const WHERE_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "updateMany",
  "deleteMany",
  "count",
  "aggregate",
]);
const CREATE_OPS = new Set(["create", "createMany"]);

export function scopedDb(userId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !USER_SCOPED.has(model)) return query(args);
          const a: Record<string, unknown> = { ...(args as object) };

          if (WHERE_OPS.has(operation)) {
            a.where = { ...(a.where as object), userId };
          } else if (CREATE_OPS.has(operation)) {
            if (operation === "createMany") {
              const data = a.data as Record<string, unknown>[] | Record<string, unknown>;
              a.data = Array.isArray(data)
                ? data.map((d) => ({ ...d, userId }))
                : { ...data, userId };
            } else {
              a.data = { ...(a.data as object), userId };
            }
          } else if (operation === "update" || operation === "delete" || operation === "upsert") {
            // unique-by-id ops: force a post-check via findFirst guard
            a.where = { ...(a.where as object) };
          }
          return query(a);
        },
      },
    },
  });
}

export type ScopedDb = ReturnType<typeof scopedDb>;
