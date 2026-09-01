import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Sidebar } from "@/components/Sidebar";
import { ChatBar } from "@/components/ChatBar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  return (
    <div className="flex min-h-screen">
      <Sidebar userName={session.user.name} />
      <main className="min-w-0 flex-1 px-8 py-8">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
      <ChatBar />
    </div>
  );
}
