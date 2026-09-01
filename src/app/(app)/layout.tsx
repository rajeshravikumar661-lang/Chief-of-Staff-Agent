import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DEMO_MODE } from "@/lib/demo";
import { Sidebar } from "@/components/Sidebar";
import { ChatBar } from "@/components/ChatBar";
import { DemoModeBanner } from "@/components/DemoModeBanner";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user && !DEMO_MODE) redirect("/signin");

  const userName = session?.user?.name ?? (DEMO_MODE ? "Mohin (Demo)" : undefined);

  return (
    <div className="flex min-h-screen flex-col">
      {DEMO_MODE && <DemoModeBanner />}
      <div className="flex min-h-0 flex-1">
        <Sidebar userName={userName} />
        <main className="min-w-0 flex-1 px-8 py-8">
          <div className="mx-auto max-w-4xl">{children}</div>
        </main>
        <ChatBar />
      </div>
    </div>
  );
}
