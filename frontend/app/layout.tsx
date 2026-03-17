import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./globals.css";
import "../src/styles.css";

export const metadata: Metadata = {
  title: "Alfa Processing Platform",
  description: "Operations platform for uploads, validation, exports, and interpreter management.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
