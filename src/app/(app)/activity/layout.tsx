import type { ReactNode } from "react";
import { TabNav } from "@/components/TabNav";

export default function ActivityLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">Activity</p>
      <TabNav
        tabs={[
          { href: "/activity/runs", label: "Runs" },
          { href: "/activity/history", label: "History" },
        ]}
      />
      {children}
    </div>
  );
}
