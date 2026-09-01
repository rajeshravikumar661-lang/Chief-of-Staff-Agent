/**
 * Send the WhatsApp daily digest now (test / manual trigger).
 *   npm run wa:digest                      -> every user with a linked number
 *   npm run wa:digest -- <userId|email>    -> just that user
 */
import { prisma } from "@/lib/db";
import { sendWhatsAppDigest, sendWhatsAppDigestAllUsers } from "@/jobs/whatsappDigest";

const arg = process.argv[2];

if (!arg) {
  await sendWhatsAppDigestAllUsers();
} else {
  const user = await prisma.user.findFirst({
    where: { OR: [{ id: arg }, { email: arg }] },
    select: { id: true, email: true },
  });
  if (!user) {
    console.error(`no user matching "${arg}"`);
    process.exit(1);
  }
  try {
    const r = await sendWhatsAppDigest(user.id);
    console.log(`${user.email}: ${r.sent ? "✅ sent" : `skipped (${r.reason})`}`);
  } catch (e) {
    console.error(`${user.email}: ❌ ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
process.exit(0);
