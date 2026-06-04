import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "AI FinOps Gateway",
  description: "Cost visibility, budget enforcement, and governance for LLM usage.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
