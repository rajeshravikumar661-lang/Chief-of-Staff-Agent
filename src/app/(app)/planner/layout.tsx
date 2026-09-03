import type { ReactNode } from "react";
import { TabNav } from "@/components/TabNav";

export default function PlannerLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">Calendar</p>
      <TabNav
        tabs={[
          { href: "/planner/calendar", label: "Calendar" },
          { href: "/planner/tasks", label: "Tasks" },
          { href: "/planner/commitments", label: "Commitments" },
        ]}
      />
      {children}
    </div>
  );
}
