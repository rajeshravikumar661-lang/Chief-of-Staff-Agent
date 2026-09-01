import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sweepOverdueCommitments } from "@/jobs/commitments";
import { syncPeople } from "@/jobs/relationships";

const U = "test_jobs_user";

async function wipe() {
  await prisma.commitment.deleteMany({ where: { userId: U } });
  await prisma.person.deleteMany({ where: { userId: U } });
  await prisma.message.deleteMany({ where: { userId: U } });
  await prisma.user.deleteMany({ where: { id: U } });
}

beforeAll(async () => {
  await wipe();
  await prisma.user.create({ data: { id: U, email: "owner@example.com", name: "Owner" } });
});
afterAll(wipe);

describe("sweepOverdueCommitments", () => {
  it("flips only past-deadline open commitments to overdue", async () => {
    const past = await prisma.commitment.create({
      data: { userId: U, person: "Alex", description: "send proposal", source: "gmail", deadline: new Date(Date.now() - 864e5) },
    });
    const future = await prisma.commitment.create({
      data: { userId: U, person: "Sam", description: "review doc", source: "gmail", deadline: new Date(Date.now() + 864e5) },
    });
    const noDeadline = await prisma.commitment.create({
      data: { userId: U, person: "Jo", description: "someday", source: "slack" },
    });

    const n = await sweepOverdueCommitments(U);
    expect(n).toBe(1);
    expect((await prisma.commitment.findUnique({ where: { id: past.id } }))!.status).toBe("overdue");
    expect((await prisma.commitment.findUnique({ where: { id: future.id } }))!.status).toBe("open");
    expect((await prisma.commitment.findUnique({ where: { id: noDeadline.id } }))!.status).toBe("open");
  });
});

describe("syncPeople", () => {
  it("creates Person rows from message senders, skips the owner and no-reply addresses", async () => {
    const t1 = new Date("2026-08-01T10:00:00Z");
    const t2 = new Date("2026-08-15T10:00:00Z");
    await prisma.message.createMany({
      data: [
        { userId: U, provider: "gmail", externalId: "m1", recipients: ["owner@example.com"], timestamp: t1, sender: "Jane Roe <jane.roe@acme.com>" },
        { userId: U, provider: "gmail", externalId: "m2", recipients: ["owner@example.com"], timestamp: t2, sender: "jane.roe@acme.com" },
        { userId: U, provider: "gmail", externalId: "m3", recipients: ["owner@example.com"], timestamp: t2, sender: "no-reply@notifications.acme.com" },
        { userId: U, provider: "gmail", externalId: "m4", recipients: ["team@acme.com", "owner@example.com"], timestamp: t2, sender: "Owner <owner@example.com>" },
      ],
    });

    const count = await syncPeople(U);
    const people = await prisma.person.findMany({ where: { userId: U } });
    const byEmail = Object.fromEntries(people.map((p) => [p.email, p]));

    expect(byEmail["jane.roe@acme.com"]).toBeTruthy();
    expect(byEmail["jane.roe@acme.com"].name).toBe("Jane Roe");
    expect(byEmail["jane.roe@acme.com"].lastContactAt?.toISOString()).toBe(t2.toISOString());
    expect(byEmail["owner@example.com"]).toBeUndefined();
    expect(byEmail["no-reply@notifications.acme.com"]).toBeUndefined();
    expect(byEmail["team@acme.com"]).toBeTruthy();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("is idempotent", async () => {
    await syncPeople(U);
    const a = await prisma.person.count({ where: { userId: U } });
    await syncPeople(U);
    const b = await prisma.person.count({ where: { userId: U } });
    expect(b).toBe(a);
  });
});
