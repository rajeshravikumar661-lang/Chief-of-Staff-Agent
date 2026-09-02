import type { NavIconName } from "@/components/Icons";

/**
 * Single source of truth for the app's primary/secondary navigation shape.
 * Shared by the desktop Sidebar and the mobile bottom nav / "More" sheet so
 * both surfaces can never drift out of sync.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
};

export const PRIMARY_NAV: NavItem[] = [
  { href: "/today", label: "Today", icon: "home" },
  { href: "/inbox", label: "Inbox", icon: "mail" },
  { href: "/planner", label: "Planner", icon: "calendar" },
  { href: "/workspace", label: "Workspace", icon: "users" },
  { href: "/activity", label: "Activity", icon: "activity" },
];

export const SETTINGS_NAV: NavItem = { href: "/settings", label: "Settings", icon: "gear" };

/** Items shown inside the mobile "More" sheet (everything not on the bottom bar). */
export const MORE_NAV: NavItem[] = [
  { href: "/workspace", label: "Workspace", icon: "users" },
  { href: "/activity", label: "Activity", icon: "activity" },
  SETTINGS_NAV,
];
