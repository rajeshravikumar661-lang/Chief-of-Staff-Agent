/**
 * Minimal seed — creates a demo user so local API calls have something to scope
 * to before any real OAuth connection exists. Real data comes from the
 * connectors (spec: "Do not use mock integrations in the final implementation").
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_USER_EMAIL ?? "demo@example.com";
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Demo User" },
  });
  console.log(`Seeded user ${user.email} (${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
