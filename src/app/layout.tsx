import type { ReactNode } from "react";

export const metadata = {
  title: "Chief of Staff Agent",
  description: "An AI Chief of Staff for your work tools",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
