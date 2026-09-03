import type { ReactNode } from "react";
import { Source_Serif_4, Caveat, JetBrains_Mono, Figtree } from "next/font/google";
import "./globals.css";

export const metadata = {
  title: "Kora",
  description: "Kora is an AI chief of staff that watches your work, remembers your commitments, and handles the busywork.",
};

/**
 * The "desk" type system (design: Chief of Staff Dashboard — 4a):
 *  - Source Serif 4 — everything by default (body, headings)
 *  - Caveat        — handwritten accent: the greeting, sticky-note text
 *  - JetBrains Mono — small-caps micro-labels, timestamps, meta
 * Self-hosted by next/font at build time — no runtime request to Google.
 */
const serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-serif-src",
  display: "swap",
});
const hand = Caveat({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-hand-src",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-src",
  display: "swap",
});
const sans = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-src",
  display: "swap",
});

const THEME_INIT_SCRIPT = `
try {
  if (localStorage.getItem("theme") === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  }
} catch (e) {}
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${serif.variable} ${hand.variable} ${mono.variable} ${sans.variable}`}
    >
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
