import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Chief of Staff Agent",
  description: "An AI Chief of Staff that watches your work, remembers your commitments, and handles the busywork.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
