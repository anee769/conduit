import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata = {
  title: "Conduit — control plane for AI coding agents",
  description:
    "On-prem control plane for AI coding agents: per-engineer spend attribution, egress governance, and context-rot observability — inside your own cloud.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
