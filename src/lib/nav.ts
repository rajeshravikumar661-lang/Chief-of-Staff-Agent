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

/**
 * Kora's three primary destinations. Everything else (Inbox, Documents,
 * Agent Runs/Activity, Settings) stays fully live at its existing URL — see
 * MORE_NAV — just demoted from top-level nav to a contextual surface, the
 * same pattern already used for `/chat` and `/whatsapp`.
 */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/today", label: "Today", icon: "home" },
  { href: "/planner", label: "Calendar", icon: "calendar" },
  { href: "/people", label: "People", icon: "users" },
];

export const SETTINGS_NAV: NavItem = { href: "/settings", label: "Settings", icon: "gear" };

/** Items shown inside the mobile "More" sheet (everything not on the bottom bar). */
export const MORE_NAV: NavItem[] = [
  { href: "/inbox", label: "Inbox", icon: "mail" },
  { href: "/documents", label: "Documents", icon: "documents" },
  { href: "/activity", label: "Activity", icon: "activity" },
  SETTINGS_NAV,
];
