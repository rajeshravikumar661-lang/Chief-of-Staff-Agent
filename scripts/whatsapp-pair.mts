/**
 * One-time WhatsApp pairing.  Run:  npm run wa:pair
 * Prints a QR code — scan it from WhatsApp → Settings → Linked devices.
 * Credentials are saved to WHATSAPP_AUTH_DIR (default .wa-auth/) and reused after.
 */
import { pair } from "@/integrations/whatsapp/client";

await pair();
console.log("Done. Keep the .wa-auth directory — deleting it forces a re-pair.");
process.exit(0);
