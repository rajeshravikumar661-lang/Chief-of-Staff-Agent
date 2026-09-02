import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Kora",
  description: "Kora is an AI chief of staff that watches your work, remembers your commitments, and handles the busywork.",
};

const THEME_INIT_SCRIPT = `
try {
  if (localStorage.getItem("theme") === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  }
} catch (e) {}
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Light is the default theme; this only runs when a returning
            visitor previously chose dark (see ThemeToggle), applying it
            before paint so there's no flash of the light theme first. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
