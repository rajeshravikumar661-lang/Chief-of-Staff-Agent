import { err, isResponse, requireUser } from "@/lib/http";
import { getRunDTO } from "@/agent/orchestrator";
import { runBus } from "@/agent/events";
import type { RunStreamEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("agent/runs/stream");
  if (isResponse(u)) return u;
  const { userId } = u;

  const { id } = await params;
  const run = await getRunDTO(userId, id);
  if (!run) return err("NOT_FOUND", "Run not found", 404);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe: (() => void) | undefined;
      let keepalive: ReturnType<typeof setInterval> | undefined;

      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const send = (ev: RunStreamEvent) => write(`data: ${JSON.stringify(ev)}\n\n`);

      function cleanup() {
        if (closed) return;
        closed = true;
        if (unsubscribe) unsubscribe();
        if (keepalive) clearInterval(keepalive);
        request.signal.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }

      function onAbort() {
        cleanup();
      }

      // Bootstrap: current run state so a late subscriber is never blank.
      send({ type: "plan", steps: run.steps });
      send({ type: "run_status", status: run.status, summary: run.summary ?? undefined });
      if (run.status === "succeeded" || run.status === "failed" || run.status === "partial" || run.status === "cancelled") {
        send({ type: "run_complete", run });
        cleanup();
        return;
      }

      unsubscribe = runBus.onRun(id, (ev) => {
        send(ev);
        if (ev.type === "run_complete") cleanup();
      });

      keepalive = setInterval(() => write(`:keepalive\n\n`), 20_000);

      request.signal.addEventListener("abort", onAbort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
