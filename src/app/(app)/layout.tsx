import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { DEMO_MODE } from "@/lib/demo";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { ChatBar } from "@/components/ChatBar";
import { DemoModeBanner } from "@/components/DemoModeBanner";
import { AutoSync } from "@/components/AutoSync";
import { TimezoneSync } from "@/components/TimezoneSync";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user && !DEMO_MODE) redirect("/signin");

  const userName = session?.user?.name ?? (DEMO_MODE ? "Mohin (Demo)" : undefined);

  let tz: string | null = null;
  if (session?.user?.id) {
    const row = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { timezone: true },
    });
    tz = row?.timezone ?? null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      {!DEMO_MODE && <AutoSync />}
      {!DEMO_MODE && <TimezoneSync currentTz={tz ?? ""} />}
      {DEMO_MODE && <DemoModeBanner />}
      <div className="flex items-center justify-between border-b border-hairline bg-paper px-4 py-3 lg:hidden">
        <p className="font-hand text-2xl font-bold text-ink">Kora</p>
        {userName && <p className="truncate text-xs text-ink-faint">{userName}</p>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <Sidebar userName={userName} />
        <main className="min-w-0 flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8 lg:pb-8">
          <div className="mx-auto max-w-4xl">{children}</div>
        </main>
        <ChatBar />
        <MobileNav />
      </div>
    </div>
  );
}
