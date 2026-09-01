import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, scopedDb } from "@/lib/db";

/**
 * Integration test — requires the local Postgres from `npm run db:start` and an
 * applied migration. Proves per-user isolation is enforced at the query layer
 * (spec §5, §9), not left to a caller remembering a `where` clause.
 */
const A = "test_scoped_user_A";
const B = "test_scoped_user_B";

async function wipe() {
  await prisma.message.deleteMany({ where: { userId: { in: [A, B] } } });
  await prisma.user.deleteMany({ where: { id: { in: [A, B] } } });
}

beforeAll(async () => {
  await wipe();
  await prisma.user.createMany({
    data: [
      { id: A, email: `${A}@example.com`, name: "A" },
      { id: B, email: `${B}@example.com`, name: "B" },
    ],
  });
  await prisma.message.createMany({
    data: [
      { userId: A, provider: "gmail", externalId: "a1", recipients: [], timestamp: new Date(), subject: "A one" },
      { userId: A, provider: "gmail", externalId: "a2", recipients: [], timestamp: new Date(), subject: "A two" },
      { userId: B, provider: "gmail", externalId: "b1", recipients: [], timestamp: new Date(), subject: "B one" },
    ],
  });
});

afterAll(wipe);

describe("scopedDb", () => {
  it("findMany only returns the scoped user's rows", async () => {
    const rows = await scopedDb(A).message.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.userId === A)).toBe(true);
  });

  it("count is scoped", async () => {
    expect(await scopedDb(A).message.count()).toBe(2);
    expect(await scopedDb(B).message.count()).toBe(1);
  });

  it("a where clause cannot widen past the scope", async () => {
    const rows = await scopedDb(A).message.findMany({ where: { provider: "gmail" } });
    expect(rows.every((r) => r.userId === A)).toBe(true);
  });

  it("create injects the scoped userId even if omitted", async () => {
    const created = await scopedDb(A).message.create({
      data: { provider: "gmail", externalId: "a3", recipients: [], timestamp: new Date() } as never,
    });
    expect(created.userId).toBe(A);
    await prisma.message.delete({ where: { id: created.id } });
  });

  it("findFirst is scoped", async () => {
    const mine = await scopedDb(A).message.findFirst({ where: { externalId: "b1" } });
    expect(mine).toBeNull(); // b1 belongs to B
  });
});
