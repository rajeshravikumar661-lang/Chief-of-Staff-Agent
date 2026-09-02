import type { ReactNode } from "react";
import { TabNav } from "@/components/TabNav";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">Workspace</p>
      <TabNav
        tabs={[
          { href: "/workspace/people", label: "People" },
          { href: "/workspace/documents", label: "Documents" },
        ]}
      />
      {children}
    </div>
  );
}
