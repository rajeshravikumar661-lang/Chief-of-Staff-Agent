import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { startRun, getRunDTO } from "@/agent/orchestrator";

/**
 * Integration test — requires the local Postgres from `npm run db:start` and an
 * applied migration. Proves the Observe→…→Report loop TERMINATES and persists,
 * even with no LLM key configured (it is fine for the run to end failed/partial).
 */
const USER_ID = "test_orchestrator_user";
const skip = !process.env.DATABASE_URL;

const TERMINAL = ["succeeded", "failed", "partial", "cancelled"];

async function wipe() {
  await prisma.agentRun.deleteMany({ where: { userId: USER_ID } });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
}

afterAll(wipe);

describe("orchestrator.startRun", () => {
  it.skipIf(skip)(
    "creates a run, runs the loop to a terminal status, and persists steps",
    async () => {
      await wipe();
      await prisma.user.create({
        data: { id: USER_ID, email: `${USER_ID}@example.com`, name: "Orchestrator Test" },
      });

      const { runId } = await startRun(USER_ID, "test goal");
      expect(runId).toBeTruthy();

      let dto = await getRunDTO(USER_ID, runId);
      const deadline = Date.now() + 15_000;
      while (dto && !TERMINAL.includes(dto.status) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500));
        dto = await getRunDTO(USER_ID, runId);
      }

      expect(dto).not.toBeNull();
      expect(Array.isArray(dto!.steps)).toBe(true);
      expect(TERMINAL).toContain(dto!.status);

      const row = await prisma.agentRun.findUnique({ where: { id: runId } });
      expect(row).not.toBeNull();
    },
    20_000,
  );
});
