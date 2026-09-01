import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DEMO_MODE } from "@/lib/demo";
import { Sidebar } from "@/components/Sidebar";
import { ChatBar } from "@/components/ChatBar";
import { DemoModeBanner } from "@/components/DemoModeBanner";
import { AutoSync } from "@/components/AutoSync";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user && !DEMO_MODE) redirect("/signin");

  const userName = session?.user?.name ?? (DEMO_MODE ? "Mohin (Demo)" : undefined);

  return (
    <div className="flex min-h-screen flex-col">
      {!DEMO_MODE && <AutoSync />}
      {DEMO_MODE && <DemoModeBanner />}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <Sidebar userName={userName} />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-4xl">{children}</div>
        </main>
        <ChatBar />
      </div>
    </div>
  );
}
