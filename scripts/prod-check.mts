/**
 * One-off production diagnostic. Run inside the deployment environment
 * (Render one-off job) so it uses the real TOKEN_ENCRYPTION_KEY / OAuth secret:
 *
 *   npx tsx scripts/prod-check.mts <email>
 *
 * Reports: DB reachable, user + connections, a live syncAll(), a briefing, and
 * (if linked) a WhatsApp digest — printing the exact error for anything that fails.
 */
import { prisma } from "@/lib/db";
import { syncAll } from "@/jobs/sync";
import { generateBriefing } from "@/jobs/morningBriefing";
import { sendWhatsAppDigest } from "@/jobs/whatsappDigest";

const email = process.argv[2];
if (!email) {
  console.error("usage: prod-check.mts <email>");
  process.exit(1);
}

function line(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

const run = async () => {
  const user = await prisma.user.findFirst({ where: { email } });
  line("db + user lookup", !!user, user ? `id=${user.id} tz=${user.timezone ?? "null"}` : `no user ${email}`);
  if (!user) return;

  const conns = await prisma.connection.findMany({
    where: { userId: user.id },
    select: { provider: true, status: true, lastSyncAt: true },
  });
  console.log("      connections:", conns.map((c) => `${c.provider}:${c.status}`).join(" ") || "none");

  try {
    const counts = await syncAll(user.id);
    line("syncAll()", true, JSON.stringify(counts));
  } catch (e) {
    line("syncAll()", false, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }

  const after = await prisma.connection.findMany({
    where: { userId: user.id },
    select: { provider: true, status: true },
  });
  console.log("      connections after:", after.map((c) => `${c.provider}:${c.status}`).join(" "));
  console.log(
    "      rows:",
    "msgs", await prisma.message.count({ where: { userId: user.id } }),
    "events", await prisma.calendarEvent.count({ where: { userId: user.id } }),
    "docs", await prisma.document.count({ where: { userId: user.id } }),
    "people", await prisma.person.count({ where: { userId: user.id } }),
  );

  try {
    const b = await generateBriefing(user.id);
    line("generateBriefing()", true, `${b.items.length} items`);
  } catch (e) {
    line("generateBriefing()", false, e instanceof Error ? e.message : String(e));
  }

  try {
    const r = await sendWhatsAppDigest(user.id);
    line("sendWhatsAppDigest()", r.sent, r.reason ?? "sent");
  } catch (e) {
    line("sendWhatsAppDigest()", false, e instanceof Error ? e.message : String(e));
  }
};

run()
  .catch((e) => {
    console.error("FATAL", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
