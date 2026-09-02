import type { ReactNode } from "react";
import { TabNav } from "@/components/TabNav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">Settings</p>
      <TabNav
        tabs={[
          { href: "/settings/integrations", label: "Integrations" },
          { href: "/settings/preferences", label: "Preferences" },
        ]}
      />
      {children}
    </div>
  );
}
