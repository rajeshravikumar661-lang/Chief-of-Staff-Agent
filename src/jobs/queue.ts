/**
 * Shared BullMQ / Redis plumbing for the background-jobs module.
 *
 * One `IORedis` connection is created lazily from `env.redisUrl()` and reused by
 * every queue and worker. Per BullMQ's requirement the connection is created
 * with `maxRetriesPerRequest: null`.
 *
 * If Redis is unreachable we do NOT throw at module load — ioredis / BullMQ
 * handle reconnection in the background. We only log. `getConnection()`,
 * `makeQueue()` and `makeWorker()` always return usable objects.
 */
import { Queue, Worker, type Processor, type QueueOptions, type WorkerOptions } from "bullmq";
import IORedis from "ioredis";

import { env } from "@/lib/env";

/**
 * True when `REDIS_URL` is explicitly set. `env.redisUrl()` always returns a
 * value (it falls back to `redis://localhost:6379`), so this is the only honest
 * signal for "is Redis actually configured for this deployment".
 *
 * CLAUDE.md rule: env is read through `src/lib/env.ts`. There is no helper there
 * for presence-vs-default, and the module spec explicitly requires this boolean,
 * so we read the raw var here and nowhere else.
 */
// eslint-disable-next-line no-restricted-properties
export const redisConfigured: boolean = Boolean(process.env.REDIS_URL);

let connection: IORedis | undefined;

/** The process-wide Redis connection. Created on first use. */
export function getConnection(): IORedis {
  if (connection) return connection;

  const conn = new IORedis(env.redisUrl(), {
    maxRetriesPerRequest: null,
    lazyConnect: false,
  });

  conn.on("error", (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[jobs/queue] redis connection error: ${msg}`);
  });
  conn.on("end", () => {
    console.warn("[jobs/queue] redis connection closed");
  });

  connection = conn;
  return conn;
}

/** Create a BullMQ queue bound to the shared connection. */
export function makeQueue(name: string, opts: Omit<QueueOptions, "connection"> = {}): Queue {
  return new Queue(name, { ...opts, connection: getConnection() });
}

/** Create a BullMQ worker bound to the shared connection. */
export function makeWorker<DataType = unknown, ResultType = unknown, NameType extends string = string>(
  name: string,
  processor: Processor<DataType, ResultType, NameType>,
  opts: Omit<WorkerOptions, "connection"> = {},
): Worker<DataType, ResultType, NameType> {
  return new Worker<DataType, ResultType, NameType>(name, processor, {
    ...opts,
    connection: getConnection(),
  });
}
