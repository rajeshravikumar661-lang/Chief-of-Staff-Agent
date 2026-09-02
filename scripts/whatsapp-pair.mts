/**
 * CLI WhatsApp pairing for one user (the browser flow at /whatsapp is the normal
 * way). Prints a QR to the terminal — scan from WhatsApp → Linked devices.
 *
 *   npm run wa:pair -- <userId|email>
 */
import qrcodeTerminal from "qrcode-terminal";
import { prisma } from "@/lib/db";
import { connectUser, getState } from "@/integrations/whatsapp/client";

const arg = process.argv[2];
if (!arg) {
  console.error("usage: npm run wa:pair -- <userId|email>");
  process.exit(1);
}

const user = await prisma.user.findFirst({
  where: { OR: [{ id: arg }, { email: arg }] },
  select: { id: true, email: true },
});
if (!user) {
  console.error(`no user matching "${arg}"`);
  process.exit(1);
}

console.log(`Pairing WhatsApp for ${user.email} …`);
let shown = false;
const timer = setInterval(() => {
  void getState(user.id).then((s) => {
    if (s.status === "qr" && s.qr && !shown) {
      shown = true;
      console.log("\nScan from WhatsApp → Settings → Linked devices → Link a device:\n");
      qrcodeTerminal.generate(s.qr, { small: true });
    }
    if (s.status === "connected") {
      console.log(`\n✅ linked to +${s.number}`);
      clearInterval(timer);
      process.exit(0);
    }
  });
}, 1000);

await connectUser(user.id);
