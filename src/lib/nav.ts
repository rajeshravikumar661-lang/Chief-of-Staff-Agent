/**
 * Single source of truth for the app's primary/secondary navigation shape.
 * Shared by the desktop Sidebar and the mobile bottom nav / "More" sheet so
 * both surfaces can never drift out of sync.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: string;
};

export const PRIMARY_NAV: NavItem[] = [
  { href: "/today", label: "Today", icon: "☀" },
  { href: "/inbox", label: "Inbox", icon: "✉" },
  { href: "/planner", label: "Planner", icon: "▤" },
  { href: "/workspace", label: "Workspace", icon: "◍" },
  { href: "/activity", label: "Activity", icon: "⟡" },
];

export const SETTINGS_NAV: NavItem = { href: "/settings", label: "Settings", icon: "⚙" };

/** Items shown inside the mobile "More" sheet (everything not on the bottom bar). */
export const MORE_NAV: NavItem[] = [
  { href: "/workspace", label: "Workspace", icon: "◍" },
  { href: "/activity", label: "Activity", icon: "⟡" },
  SETTINGS_NAV,
];
