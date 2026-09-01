import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { LLM } from "@/agent/llm/provider";
import { slackTools, syncSlack, SlackNotConnectedError } from "@/integrations/slack";
import { withSlack } from "@/integrations/slack";

const U = "test_slack_user";
const ctx = { userId: U, llm: {} as unknown as LLM };

async function wipe() {
  await prisma.message.deleteMany({ where: { userId: U } });
  await prisma.connection.deleteMany({ where: { userId: U } });
  await prisma.user.deleteMany({ where: { id: U } });
}

beforeAll(async () => {
  await wipe();
  await prisma.user.create({ data: { id: U, email: "slack-owner@example.com", name: "Owner" } });
});
afterAll(wipe);

describe("slackTools", () => {
  it("exposes the four M6 tools with the right permissions", () => {
    const byName = Object.fromEntries(slackTools.map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual([
      "slack.channel_history",
      "slack.list_channels",
      "slack.search",
      "slack.send_message",
    ]);
    expect(byName["slack.search"].permission).toBe("READ");
    expect(byName["slack.channel_history"].permission).toBe("READ");
    expect(byName["slack.list_channels"].permission).toBe("READ");
    expect(byName["slack.send_message"].permission).toBe("WRITE");
    expect(typeof byName["slack.send_message"].verify).toBe("function");
  });

  it("execute returns { ok: false } (never throws) when Slack is not connected", async () => {
    const search = slackTools.find((t) => t.name === "slack.search")!;
    const res = await search.execute({ query: "hello" }, ctx);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/No connected 'slack'/);
    expect(res.summary).toBeTruthy();
  });
});

describe("withSlack", () => {
  it("throws SlackNotConnectedError with no connection row", async () => {
    await expect(withSlack(U, async () => "unused")).rejects.toBeInstanceOf(
      SlackNotConnectedError,
    );
  });
});

describe("syncSlack", () => {
  it("returns 0 and writes nothing when there is no slack connection", async () => {
    const n = await syncSlack(U);
    expect(n).toBe(0);
    expect(await prisma.message.count({ where: { userId: U, provider: "slack" } })).toBe(0);
  });
});
